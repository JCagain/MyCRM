import {History,person,keys,combine,detach,applyExtraction,addSimplified,displayName,batch,signature} from './domain.mjs';
import {vcard} from './vcard.mjs';
import {fields as definitions} from './fields.mjs';
import {zipSync,strToU8} from '/zip.mjs';
const $=s=>document.querySelector(s),h=new History(),assets=new Map(),exports=new Map(),selection=new Set(),cardSelection=new Set();
let active=null,busy=false,controller=null,cancelled=false,pendingEdits=false,exporting=false;
const failures=new Map();const outcomes=new Map(); let retryOnly=false;
const session=await fetch('/session').then(r=>r.json());
const convert=OpenCC.Converter({from:'t',to:'cn'});
const status=s=>{$('#status').textContent=s;};
const current=()=>h.state.find(p=>p.id===active);
const selected=()=>h.state.filter(p=>selection.has(p.id));
function el(tag,text,attrs={}){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;Object.assign(e,attrs);return e;}
function button(text,fn){const b=el('button',text,{type:'button'});b.onclick=fn;return b;}
function change(fn){h.change(fn);render();}
function field(parent,label,value,fn,type='text'){const l=el('label',label),input=el(type==='textarea'?'textarea':'input',undefined,{value:value??''});if(type!=='textarea')input.type=type;input.oninput=()=>{pendingEdits=true;updateWarning();};input.onchange=()=>{pendingEdits=false;change(()=>fn(input.value));};l.append(input);parent.append(l);return input;}
function contentChange(p){p.revision++;}
function selectionControls(){
 const count=selected().length,p=current();
 $('#selectionCount').textContent=`${count} ${count===1?'person':'people'} selected`;
 $('#combine').disabled=busy||count<2;
 $('#detach').disabled=busy||!p||p.cards.length<2;
 $('#reviewSelected').disabled=busy||!count;
 $('#deleteSelected').disabled=busy||!count;
 $('#batch').disabled=busy||!count;
}
function reviewProblem(p){return !displayName(p)?'Enter a main name before marking reviewed.':p.suggestions.length?'Accept or dismiss extraction suggestions first.':'';}
function deletePeople(ps){
 if(busy)return status('Cancel extraction before deleting.');
 if(!ps.length)return;
 if(!confirm(`Remove ${ps.length===1?'this person':ps.length+' selected people'} from this session? Undo is available.`))return;
 const ids=new Set(ps.map(p=>p.id));
 change(s=>{for(let i=s.length-1;i>=0;i--)if(ids.has(s[i].id))s.splice(i,1);});
 status(`${ps.length} ${ps.length===1?'person':'people'} deleted. Undo is available.`);
}
function reviewActions(p){
 const actions=el('div',undefined,{className:'review-actions'});
 const review=el('label','Reviewed against source cards',{className:'review'}),check=el('input',undefined,{type:'checkbox',checked:p.reviewed,disabled:busy});
 check.onchange=()=>{const problem=check.checked?reviewProblem(p):'';if(problem){check.checked=p.reviewed;return status(problem);}change(()=>p.reviewed=check.checked);};
 review.prepend(check);
 const remove=button('Delete person',()=>deletePeople([p]));remove.className='danger';remove.disabled=busy;
 actions.append(review,remove);return actions;
}
function render(){
 if(!current())active=h.state[0]?.id;
 for(const id of selection)if(!h.state.some(p=>p.id===id))selection.delete(id);
 for(const id of cardSelection)if(!current()?.cards.includes(id))cardSelection.delete(id);
 const list=$('#people');list.replaceChildren();for(const p of h.state){const row=el('div',undefined,{className:'person'+(p.id===active?' active':'')});const c=el('input',undefined,{type:'checkbox',checked:selection.has(p.id)});c.setAttribute('aria-label','Select '+(displayName(p)||'Draft'));c.onchange=()=>{c.checked?selection.add(p.id):selection.delete(p.id);selectionControls();};const b=button(displayName(p)||assets.get(p.cards[0])?.name||'Draft',()=>{active=p.id;render();});b.append(el('small',`${p.cards.length} card(s) · ${p.reviewed?'Reviewed':'Needs review'}`));if(p.cards.some(id=>outcomes.get(id)==='failed'))b.append(el('small','Extraction failed · retry available'));row.append(c,b);list.append(row);}
 $('#undo').disabled=!h.past.length||busy;$('#redo').disabled=!h.future.length||busy;$('#extract').disabled=busy;$('#cancel').disabled=!busy;$('#retry').disabled=busy;$('#combine').disabled=busy;$('#files').disabled=busy;
 selectionControls();renderImages();renderEditor();updateWarning();
 const referenced=new Set([...h.state,...h.past.flat(),...h.future.flat()].flatMap(p=>p.cards));
 for(const [id,a] of assets)if(!referenced.has(id)){URL.revokeObjectURL(a.url);assets.delete(id);}

}
function renderImages(){const pane=$('#images'),p=current();pane.replaceChildren();if(!p){pane.append(el('p','Add card images to begin.'));return;}pane.append(el('h2','Source cards'));if(p.cards.length>1)pane.append(el('p','Tick cards here, then use Detach cards beside Combine.',{className:'hint'}));for(const id of p.cards){const a=assets.get(id);if(!a)continue;const row=el('div',undefined,{className:'card'});const label=el('label',a.name),check=el('input',undefined,{type:'checkbox',checked:cardSelection.has(id),disabled:busy});check.onchange=()=>check.checked?cardSelection.add(id):cardSelection.delete(id);label.prepend(check);const img=el('img',undefined,{src:a.url,alt:'Source card'});const open=el('a','Open full image',{href:a.url,target:'_blank',rel:'noopener'});row.append(label,img,open,button('Rotate',()=>{if(busy)return status('Cancel extraction before rotating.');a.rotation=(a.rotation+90)%360;img.style.transform=`rotate(${a.rotation}deg)`;}));if(failures.has(id))row.append(el('p',failures.get(id),{className:'warning'}));pane.append(row);}}
const fieldNames={wechats:'WeChat'};
function renderEditor(){const pane=$('#editor'),p=current();pane.replaceChildren();if(!p)return;const heading=el('div',undefined,{className:'editor-heading'});heading.append(el('h2','Contact review'),reviewActions(p));pane.append(heading);
 field(pane,'Main name (printed names, separated by spaces)',displayName(p),v=>{p.display=v;contentChange(p);});
 for(const k of keys){
  const section=el('div',undefined,{className:'field-section'}),heading=el('div',undefined,{className:'field-heading'});
  heading.append(el('h3',fieldNames[k]??k[0].toUpperCase()+k.slice(1)),button('Add '+(fieldNames[k]??k),()=>change(()=>{p[k].push({...Object.fromEntries(definitions[k].map(f=>[f,''])),origin:'manual',edited:true});contentChange(p);})));
  section.append(heading);
  if(k==='wechats')section.append(el('p','WeChat IDs are preserved in Monica Notes on import.',{className:'hint'}));
  p[k].forEach((r,i)=>{
   const row=el('div',undefined,{className:'row row-'+k});
   if(k==='names')row.append(el('small',r.origin==='generated'?'Generated simplified · editable':'Printed / manually entered'));
   if(k==='jobs')row.append(el('small',i===0?'Primary job':'Additional job'));
   for(const f of definitions[k]){const input=field(row,k==='wechats'&&f==='value'?'ID / number':f,r[f],v=>{r[f]=v;r.edited=true;contentChange(p);});input.parentElement.className='field-'+f;}
   const actions=el('div',undefined,{className:'row-actions'});
   actions.append(button('Remove',()=>change(()=>{if(k==='names'&&r.origin==='generated')p.suppressed.push(r.value);p[k].splice(i,1);contentChange(p);})));
   if(k==='jobs'&&i>0)actions.append(button('Make primary',()=>change(()=>{p.jobs.splice(i,1);p.jobs.unshift(r);contentChange(p);})));
   row.append(actions);section.append(row);
  });pane.append(section);
 }
 pane.append(button('Add simplified variants',()=>change(()=>{p.suppressed=[];addSimplified(p,convert);contentChange(p);})));field(pane,'Additional nicknames (comma separated)',p.nicknames,v=>{p.nicknames=v;contentChange(p);});field(pane,'Notes',p.notes,v=>{p.notes=v;contentChange(p);},'textarea');pane.append(el('h3','First met'));const firstMet=el('div',undefined,{className:'first-met-fields'});for(const k of ['date','occasion','location','notes'])field(firstMet,k,p.firstMet[k],v=>{p.firstMet[k]=v;contentChange(p);},k==='date'?'date':k==='notes'?'textarea':'text');pane.append(firstMet);
 for(const suggestion of p.suggestions){const row=el('div',undefined,{className:'suggestion'});row.append(el('strong','Extraction suggestions'),el('pre',JSON.stringify(suggestion.data,null,2)));for(const warning of suggestion.data.warnings)row.append(el('p',warning,{className:'warning'}));row.append(button('Accept additional values',()=>change(()=>{applyExtraction(p,suggestion.card,suggestion.data,convert);p.suggestions=p.suggestions.filter(s=>s!==suggestion);})),button('Dismiss',()=>change(()=>{p.suggestions=p.suggestions.filter(s=>s!==suggestion);})));pane.append(row);}
 pane.append(reviewActions(p));
}
$('#files').onchange=async e=>{const cards=[];for(const file of e.target.files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){status('Use JPEG, PNG or WebP, up to 12 MB per card.');continue;}const id=crypto.randomUUID();assets.set(id,{file,url:URL.createObjectURL(file),name:file.name,rotation:0});cards.push(id);}if(cards.length)change(s=>{for(const id of cards){const p=person(id);s.push(p);selection.add(p.id);active=p.id;}});e.target.value='';};
$('#all').onclick=()=>{for(const p of h.state)selection.add(p.id);render();};$('#none').onclick=()=>{selection.clear();render();};
$('#invert').onclick=()=>{for(const p of h.state)selection.has(p.id)?selection.delete(p.id):selection.add(p.id);render();};
$('#combine').onclick=()=>{if(selected().length<2)return status('Select at least two people to combine.');change(()=>{const ps=selected();active=ps[0].id;h.state=combine(h.state,ps.map(p=>p.id));selection.clear();selection.add(active);});};
$('#detach').onclick=()=>{const p=current();if(busy||!p)return;if(!cardSelection.size||cardSelection.size===p.cards.length)return status('Tick some, but not all, source cards on the open person before detaching.');change(s=>detach(s,p.id,[...cardSelection]));status('Selected cards detached into a new person. Undo is available.');};
$('#reviewSelected').onclick=()=>{if(busy)return;const ps=selected();if(!ps.length)return;const blocked=ps.filter(p=>reviewProblem(p));if(blocked.length){active=blocked[0].id;render();return status(`${blocked.length} selected ${blocked.length===1?'person needs':'people need'} a main name or resolved extraction suggestions. Nothing was marked reviewed. ${reviewProblem(blocked[0])}`);}if(ps.every(p=>p.reviewed))return status('All selected people are already reviewed.');change(()=>{for(const p of ps)p.reviewed=true;});status(`${ps.length} ${ps.length===1?'person':'people'} marked reviewed. Undo is available.`);};
$('#deleteSelected').onclick=()=>deletePeople(selected());
$('#undo').onclick=()=>{h.undo();render();};$('#redo').onclick=()=>{h.redo();render();};
$('#batch').onclick=()=>{if(!selected().length)return status('Select people first.');$('#batchForm').reset();$('#batchDialog').showModal();};
$('#batchForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);change(s=>batch(s,[...selection],Object.fromEntries(['date','occasion','location','notes'].map(k=>[k,f.get(k)])),f.has('overwrite')));$('#batchDialog').close();status('First met details updated. Undo is available.');};
async function imageData(asset){if(!asset.rotation)return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(asset.file);});const img=await createImageBitmap(asset.file),canvas=document.createElement('canvas');const swap=asset.rotation%180!==0;canvas.width=swap?img.height:img.width;canvas.height=swap?img.width:img.height;const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(asset.rotation*Math.PI/180);ctx.drawImage(img,-img.width/2,-img.height/2);img.close();return canvas.toDataURL('image/jpeg',.95);}
$('#retry').onclick=()=>{retryOnly=true;$('#extract').click();};
$('#cancel').onclick=()=>{cancelled=true;controller?.abort();status('Cancelling extraction…');};
$('#extract').onclick=async()=>{if(!selected().length)return status('Select people to extract.');busy=true;cancelled=false;render();const queue=selected().flatMap(p=>p.cards.map(card=>({id:p.id,card}))).filter(t=>!retryOnly||outcomes.get(t.card)==='failed');retryOnly=false;let failed=0,done=0;for(const task of queue){if(cancelled)break;const p=h.state.find(p=>p.id===task.id);if(!p?.cards.includes(task.card))continue;const rev=p.revision;status(`Extracting ${done+failed+1} of ${queue.length}…`);controller=new AbortController();try{const image=await imageData(assets.get(task.card));if(cancelled)break;const response=await fetch('/extract',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':session.token},body:JSON.stringify({image}),signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.error||'Extraction failed.');if(cancelled)break;const now=h.state.find(p=>p.id===task.id);if(!now?.cards.includes(task.card))continue;change(()=>{if(now.revision===rev&&keys.every(k=>!now[k].length)&&!now.notes&&!now.display&&now.revision===0){applyExtraction(now,task.card,result,convert);if(result.warnings.length)now.suggestions.push({card:task.card,data:{...Object.fromEntries(keys.map(k=>[k,[]])),notes:'',warnings:result.warnings}});}else now.suggestions.push({card:task.card,data:result});});outcomes.set(task.card,'done');failures.delete(task.card);done++;}catch(e){if(cancelled)break;outcomes.set(task.card,'failed');failures.set(task.card,e.message);failed++;status(e.message);} }busy=false;controller=null;render();status(`${cancelled?'Stopped. ':''}${done} completed; ${failed} failed. Select failed drafts to retry.`);};
function exportPeople(){if(busy)throw Error('Wait for extraction to finish, or cancel it before exporting.');const ps=selected();if(!ps.length)throw Error('No people selected. Tick their checkboxes in the list, or choose Select all reviewed people.');const pending=ps.filter(p=>!p.reviewed||p.suggestions.length);if(pending.length)throw Error(`${pending.length} of ${ps.length} selected people still need review. Resolve extraction suggestions, then tick Reviewed against source cards at the top or bottom of each contact form, or use Mark selected reviewed.`);return ps;}
function exportFeedback(message){$('#exportError').textContent=message;$('#exportError').hidden=!message;$('#combined').disabled=exporting||!!message;$('#individual').disabled=exporting||!!message;}
function downloadFilename(extension){
 const name=$('#exportFilename').value.trim().replace(/\.(vcf|zip)$/i,'').trim();
 if(!name)throw Error('Enter a download filename.');
 if(/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name))throw Error('Use a valid filename without path separators or Windows reserved names/characters.');
 return name+'.'+extension;
}
function preview(){
 $('#exportNotice').textContent='';
 $('#goReview').disabled=!selected().some(p=>!p.reviewed||p.suggestions.length);
 $('#selectReviewed').disabled=!h.state.some(p=>p.reviewed&&!p.suggestions.length);
 try{const ps=exportPeople(),filename=downloadFilename('vcf'),cards=ps.flatMap(p=>p.cards);$('#preview').textContent=ps.map(p=>vcard(p,$('#mode').value)).join('\n');exportFeedback('');$('#exportNotice').textContent=exporting?'Preparing download with original images…':`${ps.length} reviewed contact(s) ready, including ${cards.length} original image(s). Download ${filename} or ${downloadFilename('zip')} below.`;}
 catch(e){$('#preview').textContent='';exportFeedback(e.message);}
}
$('#export').onclick=()=>{$('#exportDialog').showModal();preview();};$('#mode').onchange=preview;
$('#exportFilename').oninput=preview;
$('#selectReviewed').onclick=()=>{selection.clear();for(const p of h.state)if(p.reviewed&&!p.suggestions.length)selection.add(p.id);render();preview();};
$('#goReview').onclick=()=>{const p=selected().find(p=>!p.reviewed||p.suggestions.length);if(!p)return;$('#exportDialog').close();active=p.id;render();const target=p.suggestions.length?$('#editor .suggestion'):$('#editor .review');target?.scrollIntoView({block:'center',behavior:'smooth'});if(!p.suggestions.length)target?.querySelector('input')?.focus({preventScroll:true});};
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=el('a',undefined,{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exported(ps){for(const p of ps)exports.set(p.uid,signature(p));updateWarning();status('Download requested. Check that your browser saved the file before closing.');$('#exportNotice').textContent='Download requested. Check your browser Downloads (Ctrl+J); keep this session open until the file is saved.';}
async function exportDownload(individual){
 if(exporting)return;
 let error='';
 try{
  const ps=structuredClone(exportPeople()),filename=downloadFilename(individual?'zip':'vcf'),mode=$('#mode').value;
  // Snapshot original Files before awaiting: edits/deletion during preparation must not change this export.
  const sources=ps.map(p=>p.cards.map(id=>{const a=assets.get(id);if(!a)throw Error('A source image is unavailable. Keep this session open and retry.');return {file:a.file,rotation:0};}));
  exporting=true;exportFeedback('');updateWarning();$('#exportNotice').textContent='Preparing download with original images…';
  const cards=[];
  for(let i=0;i<ps.length;i++){const photos=[];for(const source of sources[i])photos.push(await imageData(source));cards.push(vcard(ps[i],mode,photos));}
  if(individual){const files={};ps.forEach((p,i)=>{const name=displayName(p).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,65)||'contact';files[`${name}-${p.uid}.vcf`]=strToU8(cards[i]);});download(zipSync(files),filename,'application/zip');}
  else download(cards.join(''),filename,'text/vcard;charset=utf-8');
  exported(ps);
 }catch(e){error=e instanceof Error?e.message:'Could not read an original image. No download was created.';}
 finally{exporting=false;exportFeedback(error);updateWarning();}
}
$('#combined').onclick=()=>exportDownload(false);
$('#individual').onclick=()=>exportDownload(true);
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
const leave=e=>{e.preventDefault();e.returnValue='';};let warned=false;
function updateWarning(){const dirty=pendingEdits||busy||exporting||h.state.some(p=>p.suggestions.length>0||exports.get(p.uid)!==signature(p));if(dirty&&!warned){window.addEventListener('beforeunload',leave);warned=true;}if(!dirty&&warned){window.removeEventListener('beforeunload',leave);warned=false;}}
render();status(`Ready · model ${session.model}. Add card images to begin.`);

$('#checkModel').onclick=async()=>{
 const b=$('#checkModel'),label=$('#modelStatus');b.disabled=true;label.textContent='Checking model…';label.dataset.state='checking';
 try{const response=await fetch('/model-status',{headers:{'X-Session-Token':session.token}});if(!response.ok)throw Error();const result=await response.json();label.textContent=result.message+' (last checked '+new Date().toLocaleTimeString()+')';label.dataset.state=result.state;}
 catch{label.textContent='Cannot check model. Confirm the card2vcf app server is still running.';label.dataset.state='error';}
 finally{b.disabled=false;}
};
