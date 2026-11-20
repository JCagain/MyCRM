import {initialize,compatible,clean,meaningful} from './contact-metadata.mjs';
import {keys,fieldIdentity,normalizedText} from './fields.mjs';
export {keys} from './fields.mjs';
const uuid=()=>crypto.randomUUID();
export function person(card){return {id:uuid(),uid:uuid(),cards:[card],...Object.fromEntries(keys.map(key=>[key,[]])),notes:'',display:'',nicknames:'',firstMet:{date:'',occasion:'',location:'',notes:''},reviewed:false,suggestions:[],suppressed:[],revision:0,reads:{},manualChanges:[],separatePairs:[],noteSources:{}};}
export class History{
 constructor(){this.state=[];this.past=[];this.future=[];}
 change(fn){this.past.push(structuredClone(this.state));this.future=[];fn(this.state);}
 undo(){if(!this.past.length)return;this.future.push(structuredClone(this.state));this.state=this.past.pop();}
 redo(){if(!this.future.length)return;this.past.push(structuredClone(this.state));this.state=this.future.pop();}
}
const unique=values=>[...new Set(values)];
const observationKeys=new Set(['jobs','addresses','socials']);
const sourceIds=row=>unique([...(row.sources??[]),row.source].filter(Boolean));
function withSources(row,ids){row.sources=unique(ids);if(row.sources.length)row.source=row.sources[0];else delete row.source;return row;}
function uniqueText(values){const seen=new Set();return values.filter(value=>{const key=normalizedText(value);if(!key||seen.has(key))return false;seen.add(key);return true;});}
function refreshNameOrigin(row){row.origin=row.printedSources.length?'printed':row.manualName?'manual':'generated';}
function copyRow(key,row){
 const result=structuredClone(row),ids=sourceIds(row);
 result.id??=uuid();
 result.manual=!!row.manual||ids.length===0;
 withSources(result,ids);
 if(key==='names'){
  result.printedSources=row.printedSources??(row.origin==='generated'?[]:ids);
  result.manualName=!!row.manualName||(ids.length===0&&row.origin!=='generated');
  refreshNameOrigin(result);
 }
 return result;
}
function mergeRow(key,rows,row){
 const candidate=copyRow(key,row),identity=fieldIdentity(key,candidate);
 const found=identity===null?null:rows.find(item=>fieldIdentity(key,item)===identity&&compatible(key,item,candidate));
 if(!found){rows.push(candidate);return candidate;}
 withSources(found,[...sourceIds(found),...sourceIds(candidate)]);
 if(candidate.observations)found.observations=[...new Map(
  [...(found.observations??[]),...candidate.observations].map(observation=>[JSON.stringify(observation),observation])
 ).values()];
 found.manual=found.manual||candidate.manual;
 if(candidate.edited)found.edited=true;
 if('label' in candidate)found.label=uniqueText([...(found.label||'').split(' / '),...(candidate.label||'').split(' / ')]).join(' / ');
 if(key==='names'){
  found.printedSources=unique([...found.printedSources,...candidate.printedSources]);
  if(candidate.generatedFrom&&!found.generatedFrom)found.generatedFrom=candidate.generatedFrom;
  found.manualName=found.manualName||candidate.manualName;
  refreshNameOrigin(found);
 }
 return found;
}
function deduplicateRows(key,rows,remap){const result=[];for(const row of rows){const found=mergeRow(key,result,row);if(row.id&&found.id!==row.id)remap?.set(row.id,found.id);}return result;}
function noteParts(p){return p.noteParts?.join('\n\n')===p.notes?p.noteParts:p.notes.split(/\n\s*\n/);}
function mergeNotes(p,parts){p.noteParts=uniqueText([...noteParts(p),...parts]);p.notes=p.noteParts.join('\n\n');}
const noteKey=part=>JSON.stringify(normalizedText(part));
function recordNoteSources(p,part,sources){
 const key=noteKey(part);
 p.noteSources??={};
 const existing=p.noteSources[key]??(noteParts(p).some(note=>noteKey(note)===key)?[null]:[]);
 p.noteSources[key]=unique([...existing,...sources]);
}
function splitNotes(p,moved,selected){
 const keeping=[],moving=[],keptSources={};
 for(const part of noteParts(p)){
  const key=noteKey(part),sources=p.noteSources?.[key]??[null];
  const keep=sources.filter(card=>!selected.has(card)),take=sources.filter(card=>selected.has(card));
  if(keep.length){keeping.push(part);keptSources[key]=keep;}
  if(take.length){moving.push(part);moved.noteSources[key]=take;}
 }
 p.noteSources=keptSources;
 p.notes='';mergeNotes(p,keeping);mergeNotes(moved,moving);
}
function preserveDisplay(p){if(p.display.trim()&&!p.names.some(row=>normalizedText(row.value)===normalizedText(p.display)))p.names.push({value:p.display.trim(),origin:'manual',edited:true});}
function remapReviewRows(p,ids){
 for(const item of [...p.suggestions,...(p.manualChanges??[])])if(ids.has(item.rowId))item.rowId=ids.get(item.rowId);
}
export function deduplicatePerson(p){
 initialize(p);
 const oldPhones=[...p.phones];
 const remap=new Map();
 p.phones=deduplicateRows('phones',p.phones,remap);
 const phoneIds=new Map(oldPhones.map(old=>[old.id,(p.phones.find(r=>r.id===old.id)||p.phones.find(r=>fieldIdentity('phones',old)!==null&&fieldIdentity('phones',r)===fieldIdentity('phones',old)))?.id]));
 for(const r of p.socials)if(phoneIds.get(r.phoneId))r.phoneId=phoneIds.get(r.phoneId);
 for(const key of keys)if(key!=='phones')p[key]=deduplicateRows(key,p[key]??[],remap);
 remapReviewRows(p,remap);
 clean(p);
 mergeNotes(p,[]);
 p.nicknames=uniqueText(p.nicknames.split(',').map(value=>value.trim())).join(', ');
 return p;
}
export function combine(state,ids){
 const people=state.filter(p=>ids.includes(p.id));if(people.length<2)return;
 for(const p of people)preserveDisplay(p);
 const p=people[0];
 for(const q of people.slice(1)){
  p.cards=unique([...p.cards,...q.cards]);
  for(const key of keys)p[key].push(...(q[key]??[]));
  for(const part of noteParts(q))recordNoteSources(p,part,q.noteSources?.[noteKey(part)]??[null]);
  mergeNotes(p,noteParts(q));
  p.nicknames=[p.nicknames,q.nicknames].filter(Boolean).join(', ');
  for(const key of Object.keys(p.firstMet)){
   if(!p.firstMet[key])p.firstMet[key]=q.firstMet[key];
   else if(q.firstMet[key]&&normalizedText(p.firstMet[key])!==normalizedText(q.firstMet[key]))mergeNotes(p,['Other First met '+key+': '+q.firstMet[key]]);
  }
  p.suggestions.push(...q.suggestions);p.suppressed=unique([...p.suppressed,...q.suppressed]);
  p.reads={...p.reads,...q.reads};
  p.manualChanges=[...(p.manualChanges??[]),...(q.manualChanges??[])];
  p.separatePairs=unique([...(p.separatePairs??[]),...(q.separatePairs??[])]);
 }
 deduplicatePerson(p);p.reviewed=false;p.revision++;p.display='';
 return state.filter(q=>!ids.includes(q.id)||q===p);
}
function splitRow(key,row,ids,keepManual){
 const copy=withSources(structuredClone(row),ids);
 if(copy.observations)copy.observations=copy.observations.filter(observation=>ids.includes(observation.card));
 copy.manual=keepManual&&row.manual;
 if(key==='names'){
  copy.printedSources=row.printedSources.filter(id=>ids.includes(id));
  copy.manualName=keepManual&&row.manualName;
  refreshNameOrigin(copy);
 }
 return copy;
}
export function detach(state,id,cardIds){
 const p=state.find(p=>p.id===id),selected=new Set(cardIds);
 if(!p||!selected.size||selected.size>=p.cards.length||cardIds.some(card=>!p.cards.includes(card)))throw Error('Select some, but not all cards to detach.');
 preserveDisplay(p);deduplicatePerson(p);
 const moved=person(cardIds[0]);moved.cards=[...selected];const oldPhones=structuredClone(p.phones);
 for(const key of keys){
  const keep=[],take=[];
  for(const row of p[key]){
   const ids=sourceIds(row),moving=ids.filter(id=>selected.has(id)),remaining=ids.filter(id=>!selected.has(id));
   if(moving.length)take.push(splitRow(key,row,moving,false));
   if(remaining.length||row.manual)keep.push(splitRow(key,row,remaining,true));
  }
  p[key]=keep;moved[key]=take;
 }
 clean(p,oldPhones);clean(moved,oldPhones,true);
 const rowIds=new Map();
 for(const key of keys)for(const row of moved[key]){const id=uuid();rowIds.set(row.id,id);row.id=id;}
 for(const row of moved.socials)if(row.phoneId)row.phoneId=rowIds.get(row.phoneId);
 moved.suggestions=p.suggestions.filter(item=>selected.has(item.card));
 p.suggestions=p.suggestions.filter(item=>!selected.has(item.card));
 for(const card of selected)if(p.reads?.[card]){moved.reads[card]=p.reads[card];delete p.reads[card];}
 moved.separatePairs=[...(p.separatePairs??[])];
 moved.suppressed=[...p.suppressed];
 moved.manualChanges=(p.manualChanges??[]).filter(item=>item.cards.some(card=>selected.has(card))).map(item=>({...item,cards:item.cards.filter(card=>selected.has(card))}));
 p.manualChanges=(p.manualChanges??[]).filter(item=>!item.cards.length||item.cards.some(card=>!selected.has(card))).map(item=>({...item,cards:item.cards.filter(card=>!selected.has(card))}));
 remapReviewRows(moved,rowIds);
 splitNotes(p,moved,selected);
 p.cards=p.cards.filter(card=>!selected.has(card));p.display='';p.reviewed=false;p.revision++;state.push(moved);
}
export function applyExtraction(p,card,data,convert){
 deduplicatePerson(p);
 for(const key of keys)for(const row of data[key]??[]){
  const item=key==='names'?{value:row,origin:'printed'}:{...row};
  if(!Object.values(item).some(Boolean))continue;
  const identity=fieldIdentity(key,item);
  const observations=observationKeys.has(key)&&identity!==null?[{card,identity}]:undefined;
  if(observations&&p[key].some(existing=>existing.observations?.some(old=>old.card===card&&old.identity===identity)))continue;
  mergeRow(key,p[key],{...item,source:card,...(observations?{observations}:{})});
 }
 if(data.notes){
  const parts=data.notes.split(/\n\s*\n/);
  for(const part of parts)recordNoteSources(p,part,[card]);
  mergeNotes(p,parts);
 }
 deduplicatePerson(p);addSimplified(p,convert);p.reviewed=false;p.revision++;
}
export function manualChange(p,key,row){
 const identity=row?fieldIdentity(key,row):null;
 if(row&&!identity)return;
 const cards=row?sourceIds(row):key==='notes'?[...p.cards]:[];
 const change={key,identity,rowId:row?.id,cards};
 p.manualChanges??=[];
 if(!p.manualChanges.some(item=>JSON.stringify(item)===JSON.stringify(change)))p.manualChanges.push(change);
}
export function editNotes(p,value){
 const previous=noteParts(p);
 const sources=p.noteSources??{};
 p.notes=value;
 p.noteSources=Object.fromEntries(noteParts(p).filter(normalizedText).map(part=>{
  const key=noteKey(part);
  return [key,previous.some(old=>noteKey(old)===key)?sources[key]??[null]:[null]];
 }));
 manualChange(p,'notes');
}
function readValues(data){
 const values=[];
 for(const key of keys)for(const [index,value] of (data[key]??[]).entries()){
  const row=key==='names'?{value}:value,identity=fieldIdentity(key,row);
  if(identity!==null)values.push({key,index,value,identity});
 }
 for(const value of uniqueText((data.notes??'').split(/\n\s*\n/)))values.push({key:'notes',value,identity:noteKey(value)});
 return values;
}
function applyValues(p,card,values,convert){
 const data={notes:values.filter(item=>item.key==='notes').map(item=>item.value).join('\n\n')};
 for(const {key,value} of values)if(key!=='notes')(data[key]??=[]).push(value);
 applyExtraction(p,card,data,convert);
}
export function reconcileRead(p,card,data,convert,{draft,atDispatch}={}){
 const seen=new Set(p.reads?.[card]??[]);
 const repeat=Object.hasOwn(p.reads??{},card);
 const prior=new Set(seen);
 const accepted=[],warnings=[...(data.fieldWarnings??[]),...(data.warnings??[]).filter(Boolean).map(message=>({field:'source',message}))];
 const usedWarnings=new Set();
 const wholeCard=warnings.some(warning=>warning.field==='card');
 const propose=(item,token)=>{
  if(seen.has(token))return;
  p.suggestions.push({...item,card});
  seen.add(token);
  p.reviewed=false;
 };
 for(const candidate of readValues(data)){
  const {key,index,value,identity}=candidate;
  const scoped=warnings.filter(warning=>warning.field==='card'||warning.field===key&&(warning.index===undefined||warning.index===index));
  const matches=key==='notes'?[]:p[key].filter(row=>fieldIdentity(key,row)===identity);
  const matching=matches.length===1?matches[0]:undefined;
  const touched=[...(p.manualChanges??[]),draft,atDispatch].find(edit=>edit?.key===key&&(
   key==='notes'||edit.identity===identity||matches.some(row=>edit.rowId===row.id)
  ));
  const displayEdit=key==='names'&&(draft?.key==='display'||atDispatch?.key==='display'||(p.manualChanges??[]).some(edit=>edit.key==='display'));
  const context={key,rowId:touched?.rowId??matching?.id};
  const token=JSON.stringify(['value',key,identity,normalizedText(value?.label)]);
  const newWarnings=scoped.filter(warning=>{
   if(warning.field==='card')return false;
   usedWarnings.add(warning);
   const warningToken=JSON.stringify(['warning',warning.field,warning.index===undefined?null:identity,normalizedText(warning.message)]);
   if(prior.has(warningToken))return false;
   seen.add(warningToken);
   return true;
  });
  if(seen.has(token)){
   for(const warning of newWarnings)propose({...context,message:warning.message},JSON.stringify(['acknowledge',key,identity,normalizedText(warning.message)]));
   continue;
  }
  if(repeat||touched||displayEdit||scoped.length){
   const reason=wholeCard?'Confirm this card’s subject before accepting this value.':touched||displayEdit?'This value affects a field you edited.':'';
   propose({...context,value,reason,message:unique([reason,...newWarnings.map(w=>w.message)].filter(Boolean)).join(' ')},token);
  }else{
   accepted.push(candidate);
   seen.add(token);
  }
 }
 for(const warning of warnings)if(!usedWarnings.has(warning)){
  const key=warning.field==='source'?'card':warning.field;
  propose({key,message:warning.message},JSON.stringify(['warning',key,normalizedText(warning.message)]));
 }
 if(accepted.length)applyValues(p,card,accepted,convert);
 if(repeat&&seen.size===prior.size)return false;
 p.reads??={};
 p.reads[card]=[...seen];
 return true;
}
export function resolveProposal(p,suggestion,accept,convert){
 if(accept&&suggestion.value!==undefined)applyValues(p,suggestion.card,[suggestion],convert);
 p.suggestions=p.suggestions.filter(item=>item!==suggestion);
}
function pairKey(key,rows){
 const entries=rows.map(row=>{
  const observation=row.observations?.[0];
  return observation?[observation.card,observation.identity]:[sourceIds(row).sort(),fieldIdentity(key,row)];
 });
 return JSON.stringify([key,entries.map(entry=>JSON.stringify(entry)).sort()]);
}
export function separatePair(p,key,rows){
 p.separatePairs=unique([...(p.separatePairs??[]),pairKey(key,rows)]);
}
export function suggestedPair(p,key){
 if(p.cards.length!==2||!p.cards.every(card=>Object.hasOwn(p.reads??{},card)))return null;
 const choices=p.cards.map(card=>p[key].filter(row=>meaningful(key,row)&&sourceIds(row).includes(card)));
 if(choices.some(rows=>rows.length!==1))return null;
 const rows=choices.flat();
 if(rows[0]===rows[1]||rows.some(row=>row.alternativeGroupId)||(p.separatePairs??[]).includes(pairKey(key,rows)))return null;
 return rows;
}
export function addSimplified(p,convert){
 p.names=deduplicateRows('names',p.names);
 for(const name of [...p.names]){
  if(name.origin==='generated')continue;
  const value=convert(name.value);
  if(value!==name.value&&!p.suppressed.includes(value))mergeRow('names',p.names,{value,origin:'generated',generatedFrom:name.id,sources:sourceIds(name)});
 }
}
export function displayName(p){return p.display.trim()||uniqueText(p.names.filter(n=>n.origin!=='generated').map(n=>n.value.trim())).join(' ');}
export function batch(ps,ids,values,overwrite){for(const p of ps.filter(p=>ids.includes(p.id)))for(const [k,v]of Object.entries(values))if(v&&(overwrite||!p.firstMet[k]))p.firstMet[k]=v;}
export function signature(p){
 const {reviewed,suggestions,revision,reads,manualChanges,separatePairs,noteSources,noteParts,suppressed,...data}=p;
 for(const key of keys)data[key]=p[key].map(({sources,source,observations,printedSources,manual,manualName,edited,...row})=>row);
 return JSON.stringify(data);
}
