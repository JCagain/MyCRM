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
 const fieldWarnings=arr('fieldWarnings',warning=>{
  if(!warning||typeof warning!=='object'||Array.isArray(warning))throw Error('response');
  const {field,index}=warning,message=str(warning.message);
  if(!message||typeof field!=='string'||(!Object.hasOwn(fields,field)&&!['notes','card'].includes(field)))throw Error('response');
  if(index!==undefined&&(!Number.isInteger(index)||index<0||!Array.isArray(result[field])||index>=result[field].length))throw Error('response');
  return {field,...(index===undefined?{}:{index}),message};
 });
 // Preserve warning references when moving legacy WeChat rows.
 const socials=[],moved=new Map();
 const warnedWechats=new Set();
 for(const [index,row] of result.socials.entries()){
  if(socialService(row.label)!=='wechat'){
   moved.set(index,{field:'socials',index:socials.length});
   socials.push(row);
   continue;
  }
  let target=result.wechats.findIndex(account=>account.value===row.value);
  if(target<0&&row.value){
   target=result.wechats.length;
   result.wechats.push({label:'',value:row.value});
  }
  moved.set(index,target<0?{field:'wechats'}:{field:'wechats',index:target});
  warnedWechats.add(target);
 }
 result.socials=socials;
 if(x.fieldWarnings!==undefined){
  result.fieldWarnings=fieldWarnings.flatMap(warning=>{
   if(warning.field!=='socials')return [warning];
   if(warning.index!==undefined)return [{message:warning.message,...moved.get(warning.index)}];
   return [warning,...[...warnedWechats].map(index=>({field:'wechats',...(index<0?{}:{index}),message:warning.message}))];
  });
 }
 return result;
}
