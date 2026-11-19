import test from 'node:test';
import assert from 'node:assert/strict';
import {combine,detach,manualChange,person,reconcileRead,resolveProposal,signature,suggestedPair,separatePair} from '../public/domain.mjs';
import {link,unlink} from '../public/contact-metadata.mjs';
import {validateResult} from '../src/schema.mjs';

const convert=value=>value;
const read=(person,card,result,options)=>reconcileRead(person,card,validateResult(result),convert,options);
const front={names:['Fictional Name'],jobs:[{company:'Sample Studio'}],phones:[{label:'work',value:'555-0100'}],notes:'Shared note.\n\nFront note.'};
const back={names:front.names,jobs:[{company:'範例工作室'}],phones:[{label:'office',value:'555-0100'}],notes:'Shared note.\n\nBack note.'};

test('first-read merge has the same values and ownership before and after Combine',()=>{
 const projections=[];
 for(const combineFirst of [true,false]){
  const a=person('a'),b=person('b');
  if(combineFirst)combine([a,b],[a.id,b.id]);
  read(a,'a',front);read(combineFirst?a:b,'b',back);
  if(!combineFirst)combine([a,b],[a.id,b.id]);
  assert.equal(a.suggestions.length,0);
  assert.deepEqual(suggestedPair(a,'jobs').map(row=>row.company),['Sample Studio','範例工作室']);
  projections.push({jobs:a.jobs.map(({company,sources})=>({company,sources})),phones:a.phones.map(({value,label,sources})=>({value,label,sources})),notes:a.notes});
  const state=[a];
  detach(state,a.id,['b']);
  assert.deepEqual(state.map(row=>Object.keys(row.reads)),[['a'],['b']]);
  assert.deepEqual(state.map(row=>row.phones[0].sources),[['a'],['b']]);
  assert.deepEqual(state.map(row=>row.notes),['Shared note.\n\nFront note.','Shared note.\n\nBack note.']);
 }
 assert.deepEqual(projections[0],projections[1]);
});

test('a re-read omits known observations while new values and warnings require review',()=>{
 const p=person('a');
 read(p,'a',front);
 manualChange(p,'phones',p.phones[0]);p.phones.length=0;
 p.reviewed=true;const approved=signature(p);
 assert.equal(read(p,'a',front),false);
 assert.equal(p.reviewed,true);
 assert.equal(signature(p),approved);
 const changed={...front,emails:[{value:'fictional@example.invalid'}],jobs:[...front.jobs,{company:'New Studio'}],
  fieldWarnings:[{field:'jobs',index:0,message:'Check the first company.'}]};
 read(p,'a',changed);
 assert.equal(p.reviewed,false);
 assert.deepEqual(p.suggestions.map(({key,value,message})=>[key,!!value,message]),[
  ['jobs',false,'Check the first company.'],['jobs',true,''],['emails',true,'']
 ]);
 assert.equal(p.suggestions[0].rowId,p.jobs[0].id);
 resolveProposal(p,p.suggestions[0],false,convert);
 resolveProposal(p,p.suggestions[0],true,convert);
 resolveProposal(p,p.suggestions[0],false,convert);
 assert.equal(read(p,'a',changed),false);
 assert.deepEqual(p.jobs.map(row=>row.company),['Sample Studio','New Studio']);
 assert.equal(p.phones.length,0);
 assert.equal(p.emails.length,0);
 assert.equal(p.suggestions.length,0);
});

test('warnings follow normalized WeChat rows, and ambiguous subject holds the whole result',()=>{
 const data={socials:[{label:'WeChat',value:'fictional_chat'},{label:'LinkedIn',value:'fictional_profile'}],
  fieldWarnings:[{field:'socials',index:0,message:'Check the ID.'},{field:'socials',index:1,message:'Check the profile.'}]};
 assert.deepEqual(validateResult(data).fieldWarnings,[
  {field:'wechats',index:0,message:'Check the ID.'},{field:'socials',index:0,message:'Check the profile.'}
 ]);
 assert.throws(()=>validateResult({...data,fieldWarnings:[{field:'socials',index:2,message:'Invalid row.'}]}));
 const p=person('a');
 read(p,'a',{...front,fieldWarnings:[{field:'card',message:'Unclear subject.'}]});
 assert.equal(p.names.length,0);
 assert.equal(p.jobs.length,0);
 assert.equal(p.suggestions.find(item=>item.key==='card').message,'Unclear subject.');
 assert.equal(Object.hasOwn(p.reads,'a'),true);
});

test('a proposal is reassigned on Detach and an explicit unlink remains separate after recombining',()=>{
 const p=person('a');p.cards.push('b');
 read(p,'a',front);read(p,'b',back);
 const pair=suggestedPair(p,'jobs');
 link(p,'jobs',pair.map(row=>row.id));
 separatePair(p,'jobs',pair);
 unlink(p,'jobs',pair[0].id);
 assert.equal(suggestedPair(p,'jobs'),null);
 read(p,'b',{...back,fieldWarnings:[{field:'jobs',index:0,message:'Check this company.'}]});
 const state=[p];
 detach(state,p.id,['b']);
 assert.equal(p.suggestions.length,0);
 assert.equal(state[1].suggestions[0].rowId,state[1].jobs[0].id);
 combine(state,state.map(person=>person.id));
 assert.equal(suggestedPair(p,'jobs'),null);
 assert.equal(p.suggestions[0].card,'b');
});
