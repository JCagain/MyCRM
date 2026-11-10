export const fields={names:['value'],jobs:['company','title'],phones:['label','value'],emails:['label','value'],wechats:['label','value'],addresses:['label','street','city','region','postal','country'],websites:['label','value'],socials:['label','value']};
export const keys=Object.keys(fields);
export const normalizedText=value=>String(value??'').normalize('NFC').trim().replace(/\s+/gu,' ');
export function socialService(label){
 const value=normalizedText(label).normalize('NFKC').toLowerCase().replace(/\s*[:\uff1a]$/u,'');
 const parts=value.split(' / ');
 if(parts.length>1){const services=parts.map(socialService);return services.every(service=>service===services[0])?services[0]:value;}
 if(/^(?:wechat|weixin|\u5fae\u4fe1(?:\u53f7|\u865f)?|vx|wx)(?:\s*(?:id|account))?$/.test(value))return 'wechat';
 if(['linkedin','\u9886\u82f1','\u9818\u82f1'].includes(value))return 'linkedin';
 if(value==='whats app'||value==='whatsapp')return 'whatsapp';
 return value;
}
export function fieldIdentity(key,row){
 const values=fields[key].filter(field=>field!=='label').map(field=>normalizedText(row[field]));
 if(!values.some(Boolean))return null;
 // Identical handles on different services are different contact methods.
 return JSON.stringify(key==='socials'?[socialService(row.label),...values]:values);
}
