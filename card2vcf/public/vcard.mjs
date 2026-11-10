import {displayName} from './domain.mjs';
export const escapeText=s=>String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,');
const component=s=>escapeText(s).replace(/;/g,'\\;');
export function fold(line){if(/^[\x20-\x7e]*$/.test(line)){const parts=[line.slice(0,75)];for(let i=75;i<line.length;i+=74)parts.push(' '+line.slice(i,i+74));return parts.join('\r\n');}let out='',part='',bytes=0;const encoder=new TextEncoder();for(const c of line){const n=encoder.encode(c).length;if(bytes+n>75){out+=part+'\r\n';part=' ';bytes=1;}part+=c;bytes+=n;}return out+part;}
export function vcard(p,mode='monica',photos=[]){
 const name=displayName(p);if(!name)throw Error('Each contact needs a main name.');
 const lines=['BEGIN:VCARD','VERSION:4.0',`UID:${p.uid}`,`FN:${escapeText(name)}`,`N:;${component(name)};;;`];
 for(const photo of photos){const match=/^data:(image\/(?:jpeg|png|webp));base64,[A-Za-z0-9+/]+={0,2}$/.exec(photo);if(!match)throw Error('Cannot export an invalid source image.');lines.push(`PHOTO;VALUE=uri;MEDIATYPE=${match[1]}:${photo}`);}
 const aliases=[...new Set([...p.names.filter(n=>n.origin==='generated').map(n=>n.value),...p.nicknames.split(',').map(s=>s.trim())].filter(Boolean))];if(aliases.length)lines.push('NICKNAME:'+aliases.map(escapeText).join(','));
 if(mode==='structured')for(const n of p.names)if(n.origin!=='generated'&&n.value!==name)lines.push('FN:'+escapeText(n.value));
 const notes=[p.notes];
 p.jobs.forEach((j,i)=>{if(mode==='structured'||i===0){const prefix=mode==='structured'?`job${i+1}.`:'';if(j.company)lines.push(prefix+'ORG:'+component(j.company));if(j.title)lines.push(prefix+'TITLE:'+escapeText(j.title));}else notes.push(`Other job: ${j.company} — ${j.title}`);});
 for(const [key,prop]of [['phones','TEL;VALUE=text'],['emails','EMAIL'],['websites','URL']])for(const row of p[key])if(row.value){const label=(row.label||'').toLowerCase();const type=['home','work','cell','fax','voice'].includes(label)?`;TYPE=${label}`:'';if(key==='websites'){try{const url=new URL(row.value);if(!['http:','https:'].includes(url.protocol))throw Error();lines.push('URL:'+url.href);}catch{notes.push('Website (unvalidated): '+row.value);}}else lines.push(prop+type+':'+escapeText(row.value));if(row.label&&!type)notes.push(`${key} (${row.label}): ${row.value}`);}
 for(const a of p.addresses){const label=(a.label||'').toLowerCase(),type=['home','work'].includes(label)?';TYPE='+label:'';lines.push('ADR'+type+':'+['','',a.street,a.city,a.region,a.postal,a.country].map(component).join(';'));if(a.label&&!type)notes.push('Address ('+a.label+'): '+[a.street,a.city,a.region,a.postal,a.country].filter(Boolean).join(', '));}
 for(const k of ['websites','socials'])for(const r of p[k])if(r.value)notes.push(`${r.label||k}: ${r.value}`);
 for(const [k,v]of Object.entries(p.firstMet))if(v)notes.push(`First met ${k}: ${v}`);
 if(notes.some(Boolean))lines.push('NOTE:'+escapeText(notes.filter(Boolean).join('\n')));lines.push('END:VCARD');return lines.map(fold).join('\r\n')+'\r\n';
}
