import ICAL from '../node_modules/ical.js/dist/ical.js';
import {initialize,clean,statuses} from './contact-metadata.mjs';
import {person} from './domain.mjs';
import {socialService} from './fields.mjs';
import {UiError} from './ui-language.mjs';

const properties=(card,name)=>card.filter(property=>property[0]===name);
const value=property=>String(property?.[3]??'');
const components=property=>Array.isArray(property?.[3])?property[3].map(part=>[part].flat().join(', ')):[value(property)];
const type=property=>[property[1].type].flat().filter(Boolean).join(' / ');
const token=(property,key)=>String(property[1][key]??'').toLowerCase();
const manual=fields=>({id:crypto.randomUUID(),manual:true,...fields});
const unescapeSemicolons=text=>text.replace(/\\;/g,';');

function readFirstMet(card,p){
 const keys=Object.keys(p.firstMet);
 const fields=keys.flatMap(key=>properties(card,'x-c2v-first-met-'+key).slice(0,1).map(property=>[key,value(property)]));
 if(fields.length){
  Object.assign(p.firstMet,Object.fromEntries(fields));
  const fallback=fields.map(([key,text])=>`First met ${key}: ${text}`).join('\n');
  if(p.notes===fallback)p.notes='';
  else if(p.notes.endsWith('\n'+fallback))p.notes=p.notes.slice(0,-fallback.length-1);
  return;
 }
 // Older Card2VCF exports append an ordered block to a single NOTE.
 if(value(properties(card,'version')[0])!=='4.0'||properties(card,'note').length!==1||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value(properties(card,'uid')[0])))return;
 const [prefix,...parts]=p.notes.split(/(?:^|\n)First met (date|occasion|location|notes): /);
 let previous=-1;
 for(let i=0;i<parts.length;i+=2){
  const index=keys.indexOf(parts[i]),text=parts[i+1];
  if(index<=previous||!text.trim()||(parts[i]!=='notes'&&text.includes('\n')))return;
  if(parts[i]==='date'){
   const date=new Date(text+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==text)return;
  }
  previous=index;
 }
 if(parts.length){
  for(let i=0;i<parts.length;i+=2)p.firstMet[parts[i]]=parts[i+1];
  p.notes=prefix;
 }
}

function readJobs(card){
 const jobs=new Map(),jobStatuses=new Map();
 for(const property of card){
  const [name]=property,group=token(property,'group');
  if(name==='x-c2v-job-status'){
   const status=value(property).toLowerCase();
   if(group&&statuses.includes(status))jobStatuses.set(group,status);
   continue;
  }
  if(name!=='org'&&name!=='title')continue;
  const pair=token(property,'x-c2v-pair');
  if(!jobs.has(group))jobs.set(group,{pairs:new Map(),linked:false,org:0,title:0});
  const job=jobs.get(group);
  const slot=pair||job[name]++;
  if(!job.pairs.has(slot))job.pairs.set(slot,manual({company:'',title:''}));
  const row=job.pairs.get(slot);
  if(name==='org')row.company=components(property).filter(Boolean).join(' / ');
  else row.title=pair?unescapeSemicolons(value(property)):value(property);
  if(group&&pair&&token(property,'altid'))job.linked=true;
 }
 return [...jobs].flatMap(([group,job])=>{
  const rows=[...job.pairs.values()].filter(row=>row.company||row.title);
  const alternativeGroupId=job.linked&&rows.length>1?crypto.randomUUID():null;
  return rows.map(row=>({...row,status:jobStatuses.get(group)??'unspecified',
   alternativeGroupId,separationId:alternativeGroupId?null:row.id}));
 });
}

function readAddresses(card){
 const groups=new Map();
 return properties(card,'adr').map(property=>{
  const [box,extended,street,city='',region='',postal='',country='']=components(property);
  const alternative=token(property,'altid');
  if(alternative&&!groups.has(alternative))groups.set(alternative,crypto.randomUUID());
  return manual({label:type(property),street:[box,extended,street].filter(Boolean).join(', '),
   city,region,postal,country,alternativeGroupId:groups.get(alternative)??null});
 }).filter(row=>['street','city','region','postal','country'].some(key=>row[key]));
}

function readPhoto(property,index){
 const data=value(property);
 const uri=/^data:(image\/(?:jpeg|png|webp));base64,([a-z\d+/]+={0,2})$/i.exec(data);
 const encoding=token(property,'encoding');
 if(!uri&&property[2]!=='binary'&&encoding!=='b'&&encoding!=='base64')return null;
 const base64=uri?uri[2]:data;
 if(!/^[a-z\d+/]+={0,2}$/i.test(base64))return null;
 try{
  const decoded=atob(base64);
  const format=decoded.startsWith('\xff\xd8\xff')?'jpeg':
   decoded.startsWith('\x89PNG\r\n\x1a\n')?'png':
   decoded.startsWith('RIFF')&&decoded.slice(8,12)==='WEBP'?'webp':'';
  if(!format||(uri&&uri[1].toLowerCase()!=='image/'+format))return null;
  const bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  return new File([bytes],'photo-'+(index+1)+'.'+format,{type:'image/'+format});
 }catch{return null;}
}

function readContact(card){
 const p=person(),phoneGroups=new Map();
 const names=[...new Set(properties(card,'fn').map(value).map(name=>name.trim()).filter(Boolean))];
 if(!names.length){
  const [family,given,additional,prefix,suffix]=components(properties(card,'n')[0]);
  const name=[prefix,given,additional,family,suffix].filter(Boolean).join(' ').trim();
  if(name)names.push(name);
 }
 p.display=names[0]??'';
 p.names=names.map(name=>manual({value:name,origin:'manual',manualName:true,printedSources:[]}));
 p.nicknames=properties(card,'nickname').flatMap(property=>property.slice(3)).filter(Boolean).join(', ');
 p.notes=properties(card,'note').map(property=>property.slice(3).join(',')).filter(Boolean).join('\n\n');
 readFirstMet(card,p);
 p.jobs=readJobs(card);
 p.addresses=readAddresses(card);
 for(const [key,name] of [['phones','tel'],['emails','email'],['websites','url'],['wechats','x-wechat']]){
  for(const property of properties(card,name)){
   let text=value(property);
   if(name==='tel'&&/^tel:/i.test(text)){
    text=text.slice(4);
    try{text=decodeURIComponent(text);}catch{}
   }
   if(!text.trim())continue;
   const row=manual({label:type(property),value:text});
   p[key].push(row);
   const group=token(property,'group');
   if(name==='tel'&&group)phoneGroups.set(group,phoneGroups.has(group)?null:row.id);
  }
 }
 for(const property of card.filter(property=>['x-socialprofile','socialprofile'].includes(property[0]))){
  const label=type(property),service=socialService(label);
  const text=unescapeSemicolons(value(property));
  if(!text.trim())continue;
  const phoneId=service==='whatsapp'?phoneGroups.get(token(property,'x-c2v-phone'))??null:null;
  p[service==='wechat'?'wechats':'socials'].push(manual({label,value:text,phoneId}));
 }
 const photos=properties(card,'photo').map(readPhoto);
 return {person:clean(initialize(p)),photos:photos.filter(Boolean),skippedPhotos:photos.filter(photo=>!photo).length};
}

export function readVcf(text){
 const source=text.replace(/^\ufeff/,'').replace(/\r\n?/g,'\n');
 const contacts=[];
 let start=null,cursor=0;
 for(const marker of source.matchAll(/^(BEGIN|END):([a-z\d-]+)[ \t]*$/gim)){
  if(marker[2].toUpperCase()!=='VCARD')throw new UiError('Choose a valid vCard (.vcf) file.');
  if(marker[1].toUpperCase()==='BEGIN'){
   if(start!==null||source.slice(cursor,marker.index).trim())throw new UiError('Choose a valid vCard (.vcf) file.');
   start=marker.index+marker[0].length;
   continue;
  }
  if(start===null)throw new UiError('Choose a valid vCard (.vcf) file.');
  cursor=marker.index+marker[0].length;
  let card;
  try{[,card]=ICAL.parse('BEGIN:VCARD'+source.slice(start,marker.index)+'END:VCARD');}
  catch{throw new UiError('Choose a valid vCard (.vcf) file.');}
  if(!['3.0','4.0'].includes(value(properties(card,'version')[0])))throw new UiError('Open VCF supports vCard 3.0 and 4.0 files.');
  contacts.push(readContact(card));
  start=null;
 }
 if(start!==null||source.slice(cursor).trim()||!contacts.length)throw new UiError('Choose a valid vCard (.vcf) file.');
 return contacts;
}
