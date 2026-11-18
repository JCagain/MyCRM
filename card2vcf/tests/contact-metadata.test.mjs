import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './fixtures/integration-contract.mjs';
import {History,deduplicatePerson,detach,combine,signature,person,applyExtraction} from '../public/domain.mjs';
import {link,unlink,setStatus,primary,remove,socialValue,associate} from '../public/contact-metadata.mjs';
import {vcard} from '../public/vcard.mjs';
import {validateResult} from '../src/schema.mjs';

test('accepting the same card again preserves job status and the chosen WhatsApp number source',()=>{
 const p=person('front'),history=new History();
 history.state=[p];
 const input={names:['Fictional'],jobs:[{company:'Example',title:'Advisor'}],socials:[{label:'WhatsApp',value:'555-0100'}]};
 applyExtraction(p,'front',{...input,phones:[{value:'555-0100'}]},x=>x);
 setStatus(p,p.jobs[0].id,'former');
 associate(p,p.socials[0].id,p.phones[0].id);
 p.phones[0].value='555-0101';
 history.change(()=>applyExtraction(p,'front',input,x=>x));
 for(const restore of [()=>{},()=>history.undo(),()=>history.redo()]){
  restore();
  const current=history.state[0];
  assert.deepEqual(current.jobs.map(job=>job.status),['former']);
  assert.equal(current.socials.length,1);
  assert.equal(current.socials[0].phoneId,current.phones[0].id);
  assert.match(vcard(current,'structured'),/X-C2V-PHONE=phone1:555-0101/);
 }
});

test('blank jobs do not claim the compatible export primary or generate fallback notes',()=>{
 const p=person('front');
 p.display='Fictional';
 const blank={company:' ',title:''};
 p.jobs=[blank,{company:'Example',title:'Advisor'},blank];
 assert.match(vcard(p),/ORG:Example\r\nTITLE:Advisor/);
 assert.doesNotMatch(vcard(p),/NOTE:Other job/);
 p.jobs=[blank];
 assert.doesNotMatch(vcard(p),/\r\n(?:ORG|TITLE|NOTE):/);
});
test('status conflicts, grouping, primary and history preserve metadata',()=>{const p=fixture(),h=new History();h.state=[p];const before=structuredClone(p);h.change(()=>{setStatus(p,p.jobs[0].id,'current');primary(p,p.jobs[1].id);});assert.equal(p.jobs[0].status,'current');assert.equal(p.jobs[1].status,'current');h.undo();assert.deepEqual(h.state[0],before);h.redo();assert.equal(h.state[0].jobs[0].company,'\u793a\u4f8b');const snapshot=signature(p);assert.throws(()=>link(p,'jobs',[p.jobs[0].id,p.jobs[2].id]));assert.equal(signature(p),snapshot);});
test('unlink survives dedup and equal text never bridges explicit groups',()=>{const p=fixture();unlink(p,'jobs',p.jobs[0].id);p.jobs[1].company=p.jobs[0].company;p.jobs[1].title=p.jobs[0].title;deduplicatePerson(p);assert.equal(p.jobs.length,3);assert.equal(p.jobs[0].alternativeGroupId,null);const before=structuredClone(p);deduplicatePerson(p);assert.deepEqual(p,before);});
test('phone references follow edits, survive dedup and become independent on delete',()=>{const p=fixture(),wa=p.socials[1];p.phones[0].value='555-0111';assert.equal(socialValue(p,wa),'555-0111');p.phones.push({...p.phones[0],id:crypto.randomUUID()});wa.phoneId=p.phones[1].id;deduplicatePerson(p);assert.equal(p.socials[1].phoneId,p.phones[0].id);remove(p,'phones',p.phones[0].id);assert.equal(p.socials[1].value,'555-0111');assert.equal(p.socials[1].phoneId,null);});

test('detach, phone edit and recombine preserve distinct phone associations and history',()=>{
 const p=fixture();p.cards.push('back');
 for(const key of ['jobs','addresses','phones','socials'])for(const row of p[key]){row.sources=['front','back'];row.source='front';}
 const h=new History();h.state=[p];const before=structuredClone(h.state);
 h.change(state=>detach(state,p.id,['back']));
 const moved=h.state[1];
 for(const key of ['jobs','addresses','phones','socials'])assert.ok(moved[key].every(row=>!p[key].some(original=>original.id===row.id)));
 assert.equal(moved.socials[1].phoneId,moved.phones[0].id);
 h.change(()=>moved.phones[0].value='555-0198');
 h.change(state=>{h.state=combine(state,state.map(person=>person.id));});
 const combined=h.state[0],linked=combined.socials.filter(row=>row.phoneId);
 assert.equal(linked.length,2);assert.equal(new Set(combined.phones.map(row=>row.id)).size,2);
 assert.deepEqual(linked.map(row=>socialValue(combined,row)),['555-0100','555-0198']);
 const text=vcard(combined,'structured');assert.match(text,/X-C2V-PHONE=phone1:555-0100/);assert.match(text,/X-C2V-PHONE=phone2:555-0198/);
 const after=structuredClone(h.state);h.undo();h.undo();h.undo();assert.deepEqual(h.state,before);h.redo();h.redo();h.redo();assert.deepEqual(h.state,after);
});

test('phone dedup remaps associations before social dedup and is idempotent',()=>{
 const p=fixture(),phone=p.phones[0],wa=p.socials[1];
 p.phones.push({...phone,id:crypto.randomUUID()});p.socials.push({...wa,id:crypto.randomUUID(),phoneId:p.phones[1].id});
 p.socials.push({...wa,id:crypto.randomUUID(),phoneId:null});
 deduplicatePerson(p);
 assert.equal(p.phones.length,1);assert.equal(p.socials.filter(row=>row.phoneId).length,1);
 assert.equal(p.socials.filter(row=>row.label==='WhatsApp'&&!row.phoneId&&row.value===phone.value).length,1);
 const once=structuredClone(p);deduplicatePerson(p);assert.deepEqual(p,once);
});
test('detach resolves missing references and combine does not relink variants',()=>{const p=fixture();p.cards.push('back');p.socials[1].sources=['back'];p.socials[1].source='back';const state=[p];detach(state,p.id,['back']);assert.equal(state[1].socials[0].phoneId,null);assert.equal(state[1].socials[0].value,'555-0100');assert.equal(state[0].jobs[0].alternativeGroupId,state[0].jobs[1].alternativeGroupId);assert.equal(combine(state,state.map(p=>p.id)).length,1);});
test('model cannot supply metadata and blank rows remain blank',()=>{const result=validateResult({jobs:[{company:'',id:'hostile',status:'former',alternativeGroupId:'evil'}],socials:[{label:'WhatsApp',value:'555-0100',phoneId:'evil'}]});assert.deepEqual(result.jobs,[{company:'',title:''}]);assert.equal(result.socials[0].phoneId,undefined);});
