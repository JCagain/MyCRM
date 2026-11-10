export function validateResult(x){
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('response');
 const str=v=>{if(typeof v!=='string'||v.length>10000)throw Error('response');return v.trim();};
 const arr=(k,fn)=>{if(x[k]===undefined)return [];if(!Array.isArray(x[k])||x[k].length>100)throw Error('response');return x[k].map(fn);};
 const rows=(k,fields)=>arr(k,r=>{if(!r||typeof r!=='object'||Array.isArray(r))throw Error('response');return Object.fromEntries(fields.map(f=>[f,str(r[f]??'')]));});
 return {names:arr('names',str),jobs:rows('jobs',['company','title']),phones:rows('phones',['label','value']),emails:rows('emails',['label','value']),addresses:rows('addresses',['label','street','city','region','postal','country']),websites:rows('websites',['label','value']),socials:rows('socials',['label','value']),notes:str(x.notes??''),warnings:arr('warnings',str)};
}
