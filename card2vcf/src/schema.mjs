import {fields,socialService} from '../public/fields.mjs';
export function validateResult(x){
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('response');
 const str=v=>{if(typeof v!=='string'||v.length>10000)throw Error('response');return v.trim();};
 const arr=(key,fn)=>{if(x[key]===undefined)return [];if(!Array.isArray(x[key])||x[key].length>100)throw Error('response');return x[key].map(fn);};
 const result={names:arr('names',str)};
 for(const [key,columns] of Object.entries(fields))if(key!=='names')result[key]=arr(key,row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('response');
  return Object.fromEntries(columns.map(field=>[field,str(row[field]??'')]));
 });
 result.notes=str(x.notes??'');result.warnings=arr('warnings',str);
 // Preserve compatibility with models that put WeChat into the social array.
 result.socials=result.socials.filter(row=>{
  if(socialService(row.label)!=='wechat')return true;
  if(row.value&&!result.wechats.some(account=>account.value===row.value))result.wechats.push({label:'',value:row.value});
  return false;
 });
 return result;
}
