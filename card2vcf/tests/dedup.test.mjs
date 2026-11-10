import test from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import {History,person,keys,combine,detach,applyExtraction,deduplicatePerson,signature} from '../public/domain.mjs';
import {validateResult} from '../src/schema.mjs';
import {extractionPrompt} from '../src/extraction-prompt.mjs';
import {vcard} from '../public/vcard.mjs';
const identity=value=>value;
const email='fictional@example.invalid';
const fixture=(second=false)=>validateResult({
 names:['Fictional Person'],jobs:[{company:second?'\u793a\u4f8b\u516c\u53f8\n Example Company':'\u793a\u4f8b\u516c\u53f8 Example Company',title:'Advisor'}],
 phones:[{label:second?'phone':'\u7535\u8bdd',value:'555-0100'}],emails:[{label:second?'email':'\u7535\u90ae',value:email}],wechats:[{label:second?'personal':'work',value:'fictional_wechat'}],
 addresses:[{label:second?'address':'\u5730\u5740',street:second?'\u793a\u4f8b\u8def1\u53f7\n1 Example Road':'\u793a\u4f8b\u8def1\u53f7 1 Example Road',city:'Example City',country:'China'}],
 websites:[{label:second?'website':'\u7f51\u5740',value:'https://example.invalid/'}],socials:[{label:second?'\u9886\u82f1':'LinkedIn',value:'fictional_profile'}],notes:'Shared fictional note.'
});
test('all fields coalesce after Combine and accepted extraction without losing card sources',()=>{
 const h=new History();h.state=[person('front'),person('back')];
 applyExtraction(h.state[0],'front',fixture(),identity);applyExtraction(h.state[1],'back',fixture(true),identity);
 h.state[0].nicknames='Example, Example';h.state[1].nicknames='Example, Alias';h.state[0].reviewed=true;
 const original=structuredClone(h.state);
 h.change(()=>h.state=combine(h.state,h.state.map(p=>p.id)));
 const merged=h.state[0];assert.equal(merged.reviewed,false);assert.equal(merged.notes,'Shared fictional note.');assert.equal(merged.nicknames,'Example, Alias');
 for(const key of keys){assert.equal(merged[key].length,1,key);assert.deepEqual(merged[key][0].sources,['front','back'],key);}
 assert.equal(merged.emails[0].label,'\u7535\u90ae / email');
 applyExtraction(merged,'back',fixture(true),identity);
 for(const key of keys)assert.equal(merged[key].length,1,key+' after accepting repeated extraction');
 assert.equal(merged.notes,'Shared fictional note.');
 const parsed=new ICAL.Component(ICAL.parse(vcard(merged)));
 for(const property of ['email','tel','adr','org','url','x-wechat'])assert.equal(parsed.getAllProperties(property).length,1,property);
 h.undo();assert.deepEqual(h.state,original);h.redo();
 h.change(state=>detach(state,state[0].id,['back']));
 for(const [index,source]of ['front','back'].entries())for(const key of keys){assert.equal(h.state[index][key].length,1,key);assert.deepEqual(h.state[index][key][0].sources,[source]);}
 assert.notEqual(h.state[0].emails[0],h.state[1].emails[0]);
 h.undo();assert.equal(h.state.length,1);h.redo();assert.equal(h.state.length,2);
});
test('different jobs, address components, language variants and social services remain distinct',()=>{
 const p=person('a');applyExtraction(p,'a',fixture(),identity);
 applyExtraction(p,'a',validateResult({names:['Another Printed Name'],jobs:[{company:'Example Company',title:'Advisor'},{company:'\u793a\u4f8b\u516c\u53f8 Example Company',title:'Director'}],addresses:[{street:'1 Example Road',city:'Example City',country:'China'},{street:'\u793a\u4f8b\u8def1\u53f7 1 Example Road',city:'Different City',country:'China'}],socials:[{label:'Twitter',value:'fictional_profile'}]}),identity);
 assert.equal(p.names.length,2);assert.equal(p.jobs.length,3);assert.equal(p.addresses.length,3);assert.equal(p.socials.length,2);
});
test('manual shared entries stay on the original person and edits survive accepted extraction',()=>{
 const a=person('a'),b=person('b');a.emails.push({label:'custom',value:email,origin:'manual',edited:true});
 applyExtraction(b,'b',validateResult({emails:[{label:'work',value:email}]}),identity);
 let state=combine([a,b],[a.id,b.id]);assert.equal(state[0].emails.length,1);
 detach(state,a.id,['b']);assert.equal(state[0].emails[0].value,email);assert.equal(state[1].emails[0].value,email);assert.deepEqual(state[0].emails[0].sources,[]);
 state[0].emails[0].value='edited@example.invalid';applyExtraction(state[0],'a',validateResult({emails:[{label:'work',value:email}]}),identity);
 assert.deepEqual(state[0].emails.map(row=>row.value),['edited@example.invalid',email]);
});
test('printed versus generated names retain their origin when shared rows are detached',()=>{
 const a=person('a'),b=person('b'),convert=value=>value.replaceAll('\u9673','\u9648');
 applyExtraction(a,'a',validateResult({names:['\u9673']}),convert);applyExtraction(b,'b',validateResult({names:['\u9648']}),convert);
 const state=combine([a,b],[a.id,b.id]);assert.equal(state[0].names.length,2);assert.equal(state[0].names.find(row=>row.value==='\u9648').origin,'printed');
 detach(state,a.id,['b']);assert.equal(state[0].names.find(row=>row.value==='\u9648').origin,'generated');assert.equal(state[1].names[0].origin,'printed');
});
test('note blocks coalesce across repeated acceptance without resurrecting manually removed notes',()=>{
 const p=person('a');applyExtraction(p,'a',validateResult({notes:'First block.\n\nSecond block.'}),identity);
 applyExtraction(p,'a',validateResult({notes:'Second block.\n\nThird block.'}),identity);assert.equal(p.notes,'First block.\n\nSecond block.\n\nThird block.');
 p.notes='Manually replaced.';deduplicatePerson(p);assert.equal(p.notes,'Manually replaced.');
});
test('WeChat labels normalize into the dedicated field without guessing from phone numbers',()=>{
 for(const label of ['WeChat','WECHAT ID','Weixin','\u5fae\u4fe1','\u5fae\u4fe1\u53f7','\u5fae\u4fe1\u865f','VX','vx','WX','wx','\uff36\uff38\uff1a']){
  const result=validateResult({socials:[{label,value:' Fictional_ID '}]});assert.deepEqual(result.wechats,[{label:'',value:'Fictional_ID'}]);assert.deepEqual(result.socials,[]);
 }
 const data=validateResult({phones:[{label:'work',value:'555-0100'}],socials:[{label:'LinkedIn',value:'VX_designer'},{label:'VXRacing',value:'fictional'}]});assert.deepEqual(data.wechats,[]);assert.equal(data.socials.length,2);
 assert.throws(()=>validateResult({wechats:'bad'}));assert.throws(()=>validateResult({wechats:[{value:123}]}));assert.throws(()=>validateResult({wechats:Array(101).fill({value:'fictional'})}));
 assert.match(extractionPrompt,/VX\/vx/);assert.match(extractionPrompt,/\"wechats\"/);assert.match(extractionPrompt,/preserve distinct printed language versions/);
});
test('both VCF modes deduplicate without mutating review data and safely preserve WeChat IDs',()=>{
 const p=person('a');p.display='Fictional Contact';p.emails=[{label:'email',value:email},{label:'\u7535\u90ae',value:email}];
 const value='test,semi;\\line\nEMAIL:injected@example.invalid';p.wechats=[{label:'personal',value},{label:'work',value:'fictional_work'}];const original=structuredClone(p),sig=signature(p);
 for(const mode of ['monica','structured']){
  const text=vcard(p,mode),parsed=new ICAL.Component(ICAL.parse(text));
  assert.equal(parsed.getAllProperties('email').length,1);assert.equal(parsed.getFirstPropertyValue('email'),email);
  assert.deepEqual(parsed.getAllProperties('x-wechat').map(prop=>prop.getFirstValue()),[value,'fictional_work']);assert.ok(parsed.getFirstPropertyValue('note').includes('WeChat (personal): '+value));
  for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 }
 assert.deepEqual(p,original);assert.equal(signature(p),sig);
});
