import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateResult} from './src/schema.mjs';
import {extractionPrompt,extractionRequest} from './src/extraction-prompt.mjs';
const root=new URL('./',import.meta.url);
export function createApp({endpoint=process.env.CARD2VCF_ENDPOINT||'http://127.0.0.1:9931/v1',model=process.env.CARD2VCF_MODEL||'qwen3.8-27b',key=process.env.CARD2VCF_API_KEY||'',timeout=Number(process.env.CARD2VCF_TIMEOUT_SECONDS||300)*1000}={}) {
 if(!Number.isFinite(timeout)||timeout<=0||timeout>300000)throw Error('Set CARD2VCF_TIMEOUT_SECONDS between 1 and 300');
 const target=new URL(endpoint); if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||!['http:','https:'].includes(target.protocol)||target.username||target.password||target.search||target.hash)throw Error('Use a loopback model endpoint');
 const token=randomUUID();
 const assets={'/':'public/index.html','/app.mjs':'public/app.mjs','/domain.mjs':'public/domain.mjs','/vcard.mjs':'public/vcard.mjs','/styles.css':'public/styles.css','/opencc.js':'node_modules/opencc-js/dist/umd/full.js','/zip.mjs':'node_modules/fflate/esm/browser.js'};
 return http.createServer(async(req,res)=>{
  const origin=`http://127.0.0.1:${req.socket.localPort}`;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
  const send=(status,data,type='application/json')=>{if(!res.destroyed){res.writeHead(status,{...headers,'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data);}};
  if(req.headers.host!==new URL(origin).host)return send(403,{error:'Invalid host'});
  if(req.method==='GET'&&req.url==='/session')return send(200,{token,model});
  if(req.method==='GET'&&req.url==='/model-status'){
   if(req.headers['x-session-token']!==token||(req.headers.origin&&req.headers.origin!==origin))return send(403,{error:'Invalid application request'});
   try {
    const result=await fetch(target.href.replace(/\/$/,'')+'/models',{redirect:'error',signal:AbortSignal.timeout(8000),headers:key?{Authorization:`Bearer ${key}`}:{}});
    if(!result.ok){await result.body?.cancel();return send(200,{state:'error',message:result.status===401||result.status===403?'API key rejected. Match the model server key, or leave both unset.':result.status===503?'Model server is starting or loading. Check again shortly.':`Model server returned HTTP ${result.status}. Check its PowerShell window.`});}
    let body='';const decoder=new TextDecoder();for await(const chunk of result.body){body+=decoder.decode(chunk,{stream:true});if(body.length>65536)throw Error('Invalid status response');}body+=decoder.decode();
    const data=JSON.parse(body).data;if(!Array.isArray(data))throw Error('Invalid status response');
    const matched=data.some(item=>item?.id===model);
    return send(200,{state:matched?'connected':'mismatch',message:matched?`Model reachable · ${model}`:`Server reachable, but alias ${model} is not listed. Check --alias.`});
   }catch{return send(200,{state:'error',message:'Model not reachable or not ready. Start llama in PowerShell on the configured port, then check again.'});}
  }
  if(req.method==='GET'&&assets[req.url]){try {const p=assets[req.url];return send(200,await readFile(new URL(p,root)),p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');}catch{return send(500,{error:'Missing application dependency. Run npm install.'});}}
  if(req.method!=='POST'||req.url!=='/extract')return send(404,{error:'Not found'});
  if(req.headers.origin!==origin||req.headers['x-session-token']!==token||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'Invalid application request'});
  const abort=new AbortController();let timedOut=false,stage='input';res.on('close',()=>{if(!res.writableEnded)abort.abort();});const timer=setTimeout(()=>{timedOut=true;abort.abort();},timeout);
  try{
   let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>17*1024*1024){send(413,{error:'Image exceeds 12 MB limit'});return;}chunks.push(c);}
   const {image}=JSON.parse(Buffer.concat(chunks).toString());
   if(typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image))throw Error('input');
   const raw=Buffer.from(image.split(',')[1],'base64'); if(raw.length>12*1024*1024)return send(413,{error:'Image exceeds 12 MB limit'});
   const valid=raw.subarray(0,3).equals(Buffer.from([255,216,255]))||raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(raw.toString('ascii',0,4)==='RIFF'&&raw.toString('ascii',8,12)==='WEBP');if(!valid)throw Error('input');
   stage='connection';
   const upstream=await fetch(target.href.replace(/\/$/,'')+'/chat/completions',{method:'POST',redirect:'error',signal:abort.signal,headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({model,temperature:0,max_tokens:3000,messages:[{role:'system',content:extractionPrompt},{role:'user',content:[{type:'text',text:extractionRequest},{type:'image_url',image_url:{url:image}}]}]})});
   if(!upstream.ok)return send(502,{error:`Model server returned HTTP ${upstream.status}. Check server/model configuration.`});
   stage='response';
   let text='';const decoder=new TextDecoder();for await(const c of upstream.body){text+=decoder.decode(c,{stream:true});if(text.length>1024*1024){abort.abort();throw Error('response');}}text+=decoder.decode();
   const choice=JSON.parse(text).choices?.[0];if(choice?.finish_reason==='length')return send(502,{error:'Model output reached its token limit before finishing. No values were applied.'});
   let content=choice?.message?.content;if(typeof content!=='string')throw Error('response');content=content.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
   send(200,validateResult(JSON.parse(content)));
  }catch(e){send(timedOut?504:stage==='input'?400:502,{error:timedOut?`Extraction timed out after ${timeout/1000} seconds. The local model may need more time; check its window, then retry.`:abort.signal.aborted?'Extraction cancelled. No values were applied.':stage==='response'?'Model returned invalid or incomplete contact JSON. No values were applied.':stage==='input'?'Invalid image request. Use a supported JPEG, PNG or WebP image.':'Cannot reach the local model server. Check its PowerShell window and use Check model.'});}finally{clearTimeout(timer);}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.CARD2VCF_PORT||8765);const app=createApp();app.on('error',()=>{console.error('Cannot start local server. Check port/configuration.');process.exitCode=1;});app.listen(port,'127.0.0.1',()=>console.log(`card2vcf: http://127.0.0.1:${port} (session only)`));}
