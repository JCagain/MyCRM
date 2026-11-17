import {groups,meaningful,socialValue} from './contact-metadata.mjs';
import {socialService} from './fields.mjs';
import {displayName,deduplicatePerson} from './domain.mjs';
export const escapeText=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,');
const component=s=>escapeText(s).replace(/;/g,'\\;');
export function fold(line){if(/^[\x20-\x7e]*$/.test(line)){const parts=[line.slice(0,75)];for(let i=75;i<line.length;i+=74)parts.push(' '+line.slice(i,i+74));return parts.join('\r\n');}let out='',part='',bytes=0;const encoder=new TextEncoder();for(const c of line){const n=encoder.encode(c).length;if(bytes+n>75){out+=part+'\r\n';part=' ';bytes=1;}part+=c;bytes+=n;}return out+part;}
export function vcard(p,mode='monica',photos=[]){
 p=deduplicatePerson(structuredClone(p));
 const name=displayName(p);if(!name)throw Error('Each contact needs a main name.');
 const lines=['BEGIN:VCARD','VERSION:4.0',`UID:${p.uid}`,`FN:${escapeText(name)}`,`N:;${component(name)};;;`];
 for(const photo of photos){const match=/^data:(image\/(?:jpeg|png|webp));base64,[A-Za-z0-9+/]+={0,2}$/.exec(photo);if(!match)throw Error('Cannot export an invalid source image.');lines.push(`PHOTO;VALUE=uri;MEDIATYPE=${match[1]}:${photo}`);}
 const aliases=[...new Set([...p.names.filter(n=>n.origin==='generated').map(n=>n.value),...p.nicknames.split(',').map(s=>s.trim())].filter(Boolean))];if(aliases.length)lines.push('NICKNAME:'+aliases.map(escapeText).join(','));
 if(mode==='structured')for(const n of p.names)if(n.origin!=='generated'&&n.value!==name)lines.push('FN:'+escapeText(n.value));
 const notes=[p.notes];
 const phoneGroups=new Map(p.phones.filter(r=>r.value).map((r,i)=>[r.id,'phone'+(i+1)]));
 if(mode==='structured')groups(p.jobs.filter(r=>meaningful('jobs',r))).forEach((rows,i)=>{const prefix='job'+(i+1);rows.forEach((r,j)=>{for(const [field,prop] of [['company','ORG'],['title','TITLE']])if(r[field])lines.push(prefix+'.'+prop+(rows.length>1?';ALTID='+prefix+'-'+prop.toLowerCase():'')+';X-C2V-PAIR=v'+(j+1)+':'+component(r[field]));});lines.push(prefix+'.X-C2V-JOB-STATUS;VALUE=text:'+rows[0].status);});
 p.jobs.forEach((j,i)=>{if(mode==='structured')return;if(i===0){const prefix=mode==='structured'?`job${i+1}.`:'';if(j.company)lines.push(prefix+'ORG:'+component(j.company));if(j.title)lines.push(prefix+'TITLE:'+escapeText(j.title));}else notes.push(`Other job: ${j.company} — ${j.title}`);});
 for(const [key,prop]of [['phones','TEL;VALUE=text'],['emails','EMAIL'],['websites','URL']])for(const row of p[key])if(row.value){const label=(row.label||'').toLowerCase();const type=['home','work','cell','fax','voice'].includes(label)?`;TYPE=${label}`:'';if(key==='websites'){try{const url=new URL(row.value);if(!['http:','https:'].includes(url.protocol))throw Error();lines.push('URL:'+url.href);}catch{notes.push('Website (unvalidated): '+row.value);}}else lines.push((mode==='structured'&&key==='phones'?phoneGroups.get(row.id)+'.':'')+prop+type+':'+escapeText(row.value));if(row.label&&!type)notes.push(`${key} (${row.label}): ${row.value}`);}
 // Monica 4.1.2 ignores X-WECHAT, so retain a human-readable NOTE fallback.
 for(const row of p.wechats)if(row.value){const label=(row.label||'').toLowerCase(),type=['home','work'].includes(label)?';TYPE='+label:'';lines.push('X-WECHAT;VALUE=text'+type+':'+escapeText(row.value));notes.push('WeChat'+(row.label?' ('+row.label+')':'')+': '+row.value);}
 const addressGroups=new Map();
 for(const a of p.addresses.filter(r=>meaningful('addresses',r))){if(a.alternativeGroupId&&!addressGroups.has(a.alternativeGroupId))addressGroups.set(a.alternativeGroupId,'address'+(addressGroups.size+1));const label=(a.label||'').toLowerCase(),type=['home','work'].includes(label)?';TYPE='+label:'';lines.push('ADR'+(mode==='structured'&&a.alternativeGroupId?';ALTID='+addressGroups.get(a.alternativeGroupId):'')+type+':'+['','',a.street,a.city,a.region,a.postal,a.country].map(component).join(';'));if(a.label&&!type)notes.push('Address ('+a.label+'): '+[a.street,a.city,a.region,a.postal,a.country].filter(Boolean).join(', '));}
 for(const r of p.socials){const service=socialService(r.label),value=socialValue(p,r);if(mode==='structured'&&['linkedin','whatsapp'].includes(service)&&value)lines.push('X-SOCIALPROFILE;VALUE=text;TYPE='+service+(service==='whatsapp'&&r.phoneId&&phoneGroups.has(r.phoneId)?';X-C2V-PHONE='+phoneGroups.get(r.phoneId):'')+':'+component(value));r.value=value;}
 for(const k of ['websites','socials'])for(const r of p[k])if(r.value)notes.push(`${r.label||k}: ${r.value}`);
 for(const [k,v]of Object.entries(p.firstMet))if(v)notes.push(`First met ${k}: ${v}`);
 if(notes.some(Boolean))lines.push('NOTE:'+escapeText(notes.filter(Boolean).join('\n')));lines.push('END:VCARD');return lines.map(fold).join('\r\n')+'\r\n';
}
