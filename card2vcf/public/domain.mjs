import {keys,fieldIdentity,normalizedText} from './fields.mjs';
export {keys} from './fields.mjs';
const uuid=()=>crypto.randomUUID();
export function person(card){return {id:uuid(),uid:uuid(),cards:[card],...Object.fromEntries(keys.map(key=>[key,[]])),notes:'',display:'',nicknames:'',firstMet:{date:'',occasion:'',location:'',notes:''},reviewed:false,suggestions:[],suppressed:[],revision:0};}
export class History{
 constructor(){this.state=[];this.past=[];this.future=[];}
 change(fn){this.past.push(structuredClone(this.state));this.future=[];fn(this.state);}
 undo(){if(!this.past.length)return;this.future.push(structuredClone(this.state));this.state=this.past.pop();}
 redo(){if(!this.future.length)return;this.past.push(structuredClone(this.state));this.state=this.future.pop();}
}
const unique=values=>[...new Set(values)];
const sourceIds=row=>unique([...(row.sources??[]),row.source].filter(Boolean));
function withSources(row,ids){row.sources=unique(ids);if(row.sources.length)row.source=row.sources[0];else delete row.source;return row;}
function uniqueText(values){const seen=new Set();return values.filter(value=>{const key=normalizedText(value);if(!key||seen.has(key))return false;seen.add(key);return true;});}
function refreshNameOrigin(row){row.origin=row.printedSources.length?'printed':row.manualName?'manual':'generated';}
function copyRow(key,row){
 const result=structuredClone(row),ids=sourceIds(row);
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
 const found=identity===null?null:rows.find(item=>fieldIdentity(key,item)===identity);
 if(!found){rows.push(candidate);return;}
 withSources(found,[...sourceIds(found),...sourceIds(candidate)]);
 found.manual=found.manual||candidate.manual;
 if(candidate.edited)found.edited=true;
 if('label' in candidate)found.label=uniqueText([...(found.label||'').split(' / '),...(candidate.label||'').split(' / ')]).join(' / ');
 if(key==='names'){
  found.printedSources=unique([...found.printedSources,...candidate.printedSources]);
  found.manualName=found.manualName||candidate.manualName;
  refreshNameOrigin(found);
 }
}
function deduplicateRows(key,rows){const result=[];for(const row of rows)mergeRow(key,result,row);return result;}
function noteParts(p){return p.noteParts?.join('\n\n')===p.notes?p.noteParts:p.notes.split(/\n\s*\n/);}
function mergeNotes(p,parts){p.noteParts=uniqueText([...noteParts(p),...parts]);p.notes=p.noteParts.join('\n\n');}
function preserveDisplay(p){if(p.display.trim()&&!p.names.some(row=>normalizedText(row.value)===normalizedText(p.display)))p.names.push({value:p.display.trim(),origin:'manual',edited:true});}
export function deduplicatePerson(p){
 for(const key of keys)p[key]=deduplicateRows(key,p[key]??[]);
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
  mergeNotes(p,noteParts(q));
  p.nicknames=[p.nicknames,q.nicknames].filter(Boolean).join(', ');
  for(const key of Object.keys(p.firstMet)){
   if(!p.firstMet[key])p.firstMet[key]=q.firstMet[key];
   else if(q.firstMet[key]&&normalizedText(p.firstMet[key])!==normalizedText(q.firstMet[key]))mergeNotes(p,['Other First met '+key+': '+q.firstMet[key]]);
  }
  p.suggestions.push(...q.suggestions);p.suppressed=unique([...p.suppressed,...q.suppressed]);
 }
 deduplicatePerson(p);p.reviewed=false;p.revision++;p.display='';
 return state.filter(q=>!ids.includes(q.id)||q===p);
}
function splitRow(key,row,ids,keepManual){
 const copy=withSources(structuredClone(row),ids);
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
 const moved=person(cardIds[0]);moved.cards=[...selected];
 for(const key of keys){
  const keep=[],take=[];
  for(const row of p[key]){
   const ids=sourceIds(row),moving=ids.filter(id=>selected.has(id)),remaining=ids.filter(id=>!selected.has(id));
   if(moving.length)take.push(splitRow(key,row,moving,false));
   if(remaining.length||row.manual)keep.push(splitRow(key,row,remaining,true));
  }
  p[key]=keep;moved[key]=take;
 }
 p.cards=p.cards.filter(card=>!selected.has(card));p.display='';p.reviewed=false;p.revision++;p.suggestions=[];state.push(moved);
}
export function applyExtraction(p,card,data,convert){
 deduplicatePerson(p);
 for(const key of keys)for(const row of data[key]??[]){
  const item=key==='names'?{value:row,origin:'printed'}:{...row};
  if(!Object.values(item).some(Boolean))continue;
  mergeRow(key,p[key],{...item,source:card});
 }
 if(data.notes)mergeNotes(p,data.notes.split(/\n\s*\n/));
 addSimplified(p,convert);p.reviewed=false;p.revision++;
}
export function addSimplified(p,convert){
 p.names=deduplicateRows('names',p.names);
 for(const name of [...p.names]){
  if(name.origin==='generated')continue;
  const value=convert(name.value);
  if(value!==name.value&&!p.suppressed.includes(value))mergeRow('names',p.names,{value,origin:'generated',sources:sourceIds(name)});
 }
}
export function displayName(p){return p.display.trim()||uniqueText(p.names.filter(n=>n.origin!=='generated').map(n=>n.value.trim())).join(' ');}
export function batch(ps,ids,values,overwrite){for(const p of ps.filter(p=>ids.includes(p.id)))for(const [k,v]of Object.entries(values))if(v&&(overwrite||!p.firstMet[k]))p.firstMet[k]=v;}
export function signature(p){const {reviewed,suggestions,revision,...data}=p;return JSON.stringify(data);}
