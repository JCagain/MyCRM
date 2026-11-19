import {initialize,groups,statuses,link,unlink,setStatus,primary,associate,remove,socialValue} from './contact-metadata.mjs';
import {socialService,fieldIdentity} from './fields.mjs';
import {History,person,keys,combine,detach,reconcileRead,resolveProposal,manualChange,editNotes,suggestedPair,separatePair,addSimplified,displayName,batch,signature} from './domain.mjs';
import {vcard} from './vcard.mjs';
import {fields as definitions} from './fields.mjs';
import {zipSync,strToU8} from '/zip.mjs';
import {translate,UiError} from './ui-language.mjs';
const $=s=>document.querySelector(s),h=new History(),assets=new Map(),exports=new Map(),selection=new Set(),cardSelection=new Set();
let active=null,busy=false,controller=null,cancelled=false,exporting=false;
let picker=null,pendingEdit=null,fieldRender=null,pointerDown=false,fieldRenderPending=false;
const failures=new Map();const outcomes=new Map(); let retryOnly=false;
const session=await fetch('/session').then(r=>r.json());
const convert=OpenCC.Converter({from:'t',to:'cn'});
let language='en',statusMessage,modelMessage,exportMessage,exportError;
const t=(key,...values)=>translate(language,key,...values);
const localizeError=error=>error instanceof UiError?t(error.key,...error.values):error?.message??'';
const status=(key,...values)=>{
 statusMessage=()=>t(key,...values.map(value=>typeof value==='function'?value():value));
 $('#status').textContent=statusMessage();
};
const textWalker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
const staticText=[];
const staticTitles=[...document.querySelectorAll('[title]')].map(node=>[node,node.title]);
while(textWalker.nextNode()){
 const node=textWalker.currentNode,key=node.textContent.trim();
 if(!key||node.parentElement.closest('code, option, #status, #selectionCount, #modelStatus'))continue;
 staticText.push([node,node.textContent,key]);
}
$('#uiLanguage').onchange=event=>{
 language=event.target.value==='zh-CN'?'zh-CN':'en';
 document.documentElement.lang=language;
 for(const [node,original,key] of staticText)node.textContent=original.replace(key,()=>t(key));
 for(const [node,key] of staticTitles)node.title=t(key);
 $('#status').textContent=statusMessage();
 $('#modelStatus').textContent=modelMessage();
 $('#modeHelp').textContent=modeHelp();
 $('#exportNotice').textContent=exportMessage?.()??'';
 exportFeedback(exportError);
 render();
};
const current=()=>h.state.find(p=>p.id===active);
const selected=()=>h.state.filter(p=>selection.has(p.id));
function el(tag,text,attrs={}){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;Object.assign(e,attrs);return e;}
function button(text,fn){const b=el('button',text,{type:'button'});b.onclick=fn;return b;}
function change(fn){h.change(fn);render();}
function scheduleFieldRender(){
 fieldRenderPending=true;
 if(!pointerDown&&fieldRender===null)fieldRender=setTimeout(()=>render(),0);
}
document.addEventListener('pointerdown',()=>{pointerDown=true;},true);
for(const event of ['pointerup','pointercancel'])window.addEventListener(event,()=>{
 pointerDown=false;
 if(fieldRenderPending)scheduleFieldRender();
},true);
function field(parent,label,value,fn,{type='text',key,row,column}={}){
 const l=el('label',t(label)),input=el(type==='textarea'?'textarea':'input',undefined,{value:value??''});
 if(type!=='textarea')input.type=type;
 const owner=active;
 const identity=()=>row?fieldIdentity(key,row):null;
 input.dataset.focus=JSON.stringify([owner,key,row?.id,column]);
 input.oninput=()=>{
  pendingEdit={owner,key,rowId:row?.id,identity:identity(),input};
  updateWarning();
 };
 const commit=()=>{
  pendingEdit=null;
  h.change(()=>fn(input.value));
  scheduleFieldRender();
 };
 input.onchange=commit;
 input.onblur=()=>{if(pendingEdit?.input===input)commit();};
 l.append(input);parent.append(l);return input;
}
function contentChange(p){p.revision++;}
function selectionControls(){
 const count=selected().length,p=current();
 $('#selectionCount').textContent=t('{0} {1} selected',count,count===1?'person':'people');
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
 if(!confirm(t('Remove {0} from this session? Undo is available.',ps.length===1?t('this person'):t('{0} selected people',ps.length))))return;
 const ids=new Set(ps.map(p=>p.id));
 change(s=>{for(let i=s.length-1;i>=0;i--)if(ids.has(s[i].id))s.splice(i,1);});
 status('{0} {1} deleted. Undo is available.',ps.length,ps.length===1?'person':'people');
}
function reviewActions(p){
 const actions=el('div',undefined,{className:'review-actions'});
 const review=el('label',t('Reviewed against source cards'),{className:'review'}),check=el('input',undefined,{type:'checkbox',checked:p.reviewed,disabled:busy});
 check.onchange=()=>{const problem=check.checked?reviewProblem(p):'';if(problem){check.checked=p.reviewed;return status(problem);}change(()=>p.reviewed=check.checked);};
 review.prepend(check);
 const remove=button(t('Delete person'),()=>deletePeople([p]));remove.className='danger';remove.disabled=busy;
 actions.append(review,remove);return actions;
}
function render(){
 clearTimeout(fieldRender);fieldRender=null;fieldRenderPending=false;
 const focused=document.activeElement;
 const focusKey=focused?.dataset.focus;
 const draft=pendingEdit?.input===focused?pendingEdit:null;
 const typed=draft?focused.value:null;
 const caret=draft?[focused.selectionStart,focused.selectionEnd,focused.selectionDirection]:null;
 if(draft){focused.onblur=null;focused.onchange=null;}
 if(!current())active=h.state[0]?.id;
 for(const id of selection)if(!h.state.some(p=>p.id===id))selection.delete(id);
 for(const id of cardSelection)if(!current()?.cards.includes(id))cardSelection.delete(id);
 const list=$('#people');list.replaceChildren();for(const p of h.state){const row=el('div',undefined,{className:'person'+(p.id===active?' active':'')});const c=el('input',undefined,{type:'checkbox',checked:selection.has(p.id)});c.setAttribute('aria-label',t('Select {0}',displayName(p)||t('Draft')));c.onchange=()=>{c.checked?selection.add(p.id):selection.delete(p.id);selectionControls();};const b=button(displayName(p)||assets.get(p.cards[0])?.name||t('Draft'),()=>{active=p.id;render();});b.append(el('small',t('{0} card(s) · {1}',p.cards.length,t(p.reviewed?'Reviewed':'Needs review'))));if(p.cards.some(id=>outcomes.get(id)==='failed'))b.append(el('small',t('Extraction failed · retry available')));row.append(c,b);list.append(row);}
 $('#undo').disabled=!h.past.length||busy;$('#redo').disabled=!h.future.length||busy;$('#extract').disabled=busy;$('#cancel').disabled=!busy;$('#retry').disabled=busy;$('#combine').disabled=busy;$('#files').disabled=busy;
 selectionControls();renderImages();renderEditor();
 const replacement=focusKey&&[...$('#editor').querySelectorAll('[data-focus]')].find(e=>e.dataset.focus===focusKey);
 if(replacement){
  if(draft){replacement.value=typed;pendingEdit={...draft,input:replacement};}
  replacement.focus({preventScroll:true});
  if(caret?.[0]!=null)replacement.setSelectionRange(...caret);
 }else if(draft)pendingEdit=null;
 updateWarning();
 const referenced=new Set([...h.state,...h.past.flat(),...h.future.flat()].flatMap(p=>p.cards));
 for(const [id,a] of assets)if(!referenced.has(id)){URL.revokeObjectURL(a.url);assets.delete(id);}

}
function renderImages(){
 const pane=$('#images'),p=current();pane.replaceChildren();
 if(!p){pane.append(el('p',t('Add card images to begin.')));return;}
 pane.append(el('h2',t('Source cards')));
 if(p.cards.length>1)pane.append(el('p',t('Tick cards here, then use Detach beside Link.'),{className:'hint'}));
 for(const id of p.cards){
  const a=assets.get(id);if(!a)continue;
  const row=el('div',undefined,{className:'card'});
  const label=el('label',a.name),check=el('input',undefined,{type:'checkbox',checked:cardSelection.has(id),disabled:busy});
  check.onchange=()=>check.checked?cardSelection.add(id):cardSelection.delete(id);
  label.prepend(check);
  const img=el('img',undefined,{src:a.url,alt:t('Source card')});
  if(a.rotation)img.style.transform=`rotate(${a.rotation}deg)`;
  const open=el('a',t('Open full image'),{href:a.url,target:'_blank',rel:'noopener'});
  row.append(label,img,open,button(t('Rotate'),()=>{
   if(busy)return status('Cancel extraction before rotating.');
   a.rotation=(a.rotation+90)%360;
   img.style.transform=`rotate(${a.rotation}deg)`;
  }));
  if(failures.has(id))row.append(el('p',localizeError(failures.get(id)),{className:'warning'}));
  row.append(...sourceWarnings(p,id));pane.append(row);
 }
}
const fieldNames={wechats:'WeChat'};
function section(p,key,title,addLabel=key,extra={}){
 const variants=key==='jobs'||key==='addresses';
 const container=el('div',undefined,{className:variants?'field-section framed':'field-section item contact-fields'});
 const heading=el('div',undefined,{className:variants?'field-heading':'field-heading item-heading'});
 heading.append(el('h3',t(title)),button(t('Add {0}',t(addLabel)),()=>change(()=>{
  p[key].push({...Object.fromEntries(definitions[key].map(f=>[f,''])),id:crypto.randomUUID(),origin:'manual',edited:true,...extra});
  initialize(p);contentChange(p);
 })));
 container.append(heading);
 return container;
}
function proposal(p,item){
 const box=el('div',undefined,{className:'suggestion'});
 box.append(el('strong',t('Extraction suggestion · {0}',assets.get(item.card)?.name??t('Source card'))));
 if(item.value!==undefined){
  const values=typeof item.value==='string'?[item.value]:definitions[item.key].map(field=>item.value[field]).filter(Boolean);
  box.append(el('p',values.join(' · ')),button(t('Accept value'),()=>change(()=>resolveProposal(p,item,true,convert))));
 }
 if(item.message){
  const message=item.reason?t(item.reason)+item.message.slice(item.reason.length):item.message;
  box.append(el('p',message,{className:'warning'}));
 }
 box.append(button(t(item.value===undefined?'Acknowledge':'Dismiss'),()=>change(()=>resolveProposal(p,item,false,convert))));
 return box;
}
function sourceWarnings(p,id){
 const warnings=p.suggestions.filter(item=>item.key==='card'&&item.card===id);
 return warnings.map(item=>proposal(p,item));
}
function socialView(row){
 const service=socialService(row?.label);
 return ['linkedin','whatsapp'].includes(service)?service:'socials';
}
function renderProposals(parent,p,key,{row,view=key}={}){
 for(const item of p.suggestions){
  if(item.key!==key)continue;
  const target=item.rowId&&p[key].find(r=>r.id===item.rowId);
  if((target||undefined)!==row||key==='socials'&&socialView(target??item.value)!==view)continue;
  parent.append(proposal(p,item));
 }
}
function rowFields(parent,p,key,row,{service,printed=false}={}){
 for(const column of definitions[key]){
  if(service&&column==='label')continue;
  const label=printed?({title:'Job title',postal:'Postal code'}[column]??column[0].toUpperCase()+column.slice(1)):key==='wechats'&&column==='value'?'ID / number':column;
  const input=field(parent,label,service==='whatsapp'&&column==='value'?socialValue(p,row):row[column],value=>{
   manualChange(p,key,row);
   if(key==='names'&&row.origin==='generated')p.suppressed.push(row.value);
   row[column]=value;row.edited=true;contentChange(p);
  },{key,row,column});
  input.parentElement.className='field-'+column;
  if(key==='names'&&row.origin==='generated'){
   const origin=el('small',t('Generated simplified'),{id:'name-origin-'+row.id});
   origin.setAttribute('aria-hidden','true');
   input.setAttribute('aria-describedby',origin.id);
   input.before(origin);
  }
  if(service==='whatsapp'&&row.phoneId&&column==='value')input.disabled=true;
 }
}
function removeRow(p,key,row){
 manualChange(p,key,row);
 if(key==='names'&&row.origin==='generated')p.suppressed.push(row.value);
 if(['jobs','addresses','phones','socials'].includes(key))remove(p,key,row.id);
 else p[key]=p[key].filter(item=>item!==row);
 contentChange(p);
}
function removeButton(p,key,row){
 const control=button(t('Remove'),()=>change(()=>removeRow(p,key,row)));
 control.className='danger';
 return control;
}
function jobStatus(p,row,candidateNumber){
 const label=el('label',t('Status')),select=el('select');
 select.setAttribute('aria-label',candidateNumber?t('Status for Job {0}',candidateNumber):t('Job status'));
 select.dataset.focus=JSON.stringify([p.id,row.id,candidateNumber?'candidate-status':'status']);
 for(const value of statuses)select.append(el('option',t(value[0].toUpperCase()+value.slice(1)),{value,selected:value===row.status}));
 select.onchange=()=>{
  change(()=>{
   for(const member of groups(p.jobs).find(group=>group.includes(row)))manualChange(p,'jobs',member);
   setStatus(p,row.id,select.value);
  });
  if(candidateNumber)$('#editor').querySelector(`[data-focus=${CSS.escape(select.dataset.focus)}]`)?.focus({preventScroll:true});
 };
 label.append(select);
 return label;
}
function linkEntries(p,key,first,second){
 const rows=p[key];
 if(!rows.includes(first)||!rows.includes(second)||first===second||first.alternativeGroupId&&first.alternativeGroupId===second.alternativeGroupId)return;
 if(key==='jobs'&&first.status!==second.status)return;
 change(()=>{link(p,key,[first.id,second.id]);picker=null;});
 document.getElementById('variant-'+first.id)?.closest('.item').querySelector('.link-state button').focus({preventScroll:true});
}
function variantPicker(p,key,entries,source,number,trigger){
 const job=key==='jobs',noun=t(job?'Job':'Address');
 const panel=el('div',undefined,{className:'link-picker'});
 panel.setAttribute('role','group');panel.setAttribute('aria-label',t('Link {0} {1} with another entry',noun,number));
 panel.id='picker-'+source.id;
 const close=()=>{
  picker=null;render();
  document.getElementById(trigger.id)?.focus({preventScroll:true});
 };
 for(const [index,group] of entries.entries()){
  const candidate=group[0];
  if(candidate===source)continue;
  const name=noun+' '+(index+1);
  const match=button('',()=>linkEntries(p,key,source,candidate));match.className='match';
  const caption=el('span',undefined,{className:'match-heading'});
  caption.append(el('strong',name));
  const row=job?el('div',undefined,{className:'job-match'}):match;
  if(job){
   caption.append(jobStatus(p,candidate,index+1));
   match.disabled=source.status!==candidate.status;
   if(match.disabled)caption.append(el('span',t('Job statuses differ'),{className:'mismatch'}));
  }
  row.append(caption);
  const descriptions=group.map(r=>(job?[r.company,r.title]:[r.street,r.city,r.region,r.postal,r.country,r.label]).filter(Boolean).join(' · '));
  for(const text of descriptions)match.append(el('span',text));
  if(job){
   match.setAttribute('aria-label',[t('Link with {0}',name),...descriptions.filter(Boolean)].join(' · '));
   row.append(match);
  }
  panel.append(row);
 }
 panel.append(button(t('Cancel'),close));
 panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
 return panel;
}
function pairPrompt(p,key,first,second,numbers){
 const job=key==='jobs',noun=job?'Job':'Address',title=t(job?'Same job?':'Same address?');
 const hint=el('div',undefined,{className:'same-job'});hint.setAttribute('role','group');hint.setAttribute('aria-label',title);
 const yes=button(t('Yes, link versions'),()=>linkEntries(p,key,first,second));
 yes.disabled=job&&first.status!==second.status;
 hint.append(el('strong',title),el('span',t('{0} {1} and {0} {2}',noun,numbers[0],numbers[1]),{className:'ref'}),yes,
  button(t('Keep separate'),()=>change(()=>separatePair(p,key,[first,second]))));
 if(yes.disabled){
  const warning=el('div',undefined,{className:'status-conflict'});warning.setAttribute('role','alert');
  const titleCase=value=>value[0].toUpperCase()+value.slice(1);
  warning.append(el('strong',t('Job statuses differ')),el('p',t('Job {0} is {1}. Job {2} is {3}. Set matching statuses to link these jobs, or keep them separate.',numbers[0],t(titleCase(first.status)),numbers[1],t(titleCase(second.status)))));
  hint.append(warning);
 }
 return hint;
}
function variantSection(p,key){
 const job=key==='jobs',noun=job?'Job':'Address';
 const container=section(p,key,job?'Jobs':'Addresses');
 const entries=groups(p[key]);
 if(picker?.person===p.id&&picker.key===key&&(entries.length<2||!entries.some(([row])=>row.id===picker.id)))picker=null;
 const pair=suggestedPair(p,key);
 const indices=pair?.map(row=>entries.findIndex(group=>group[0]===row)).sort((a,b)=>a-b);
 for(const [index,group] of entries.entries()){
  const [source]=group,linked=group.length>1,isPrimary=job&&index===0;
  const item=el('div',undefined,{className:linked?'item linked':'item'});
  if(linked)item.dataset.languageGroup=source.alternativeGroupId;
  const heading=el('div',undefined,{className:'item-heading'+(isPrimary?' primary-job-heading':'')});
  const details=isPrimary?el('div',undefined,{className:'job-heading-details'}):heading;
  details.append(el('strong',noun+' '+(index+1)));
  if(job)details.append(jobStatus(p,source));
  if(isPrimary)heading.append(details,el('strong',t('Primary'),{className:'primary-job-label'}));
  const controls=el('div',undefined,{className:'link-controls'});
  const open=picker?.person===p.id&&picker.key===key&&picker.id===source.id;
  let trigger;
  if(entries.length>1){
   trigger=button(t('Link with…'),()=>{
    picker=open?null:{person:p.id,key,id:source.id};
    render();
    if(open)document.getElementById(trigger.id)?.focus({preventScroll:true});
    else document.getElementById('picker-'+source.id)?.querySelector('button:enabled')?.focus({preventScroll:true});
   });
   trigger.id='link-'+source.id;
   trigger.dataset.linkWith='';
   trigger.setAttribute('aria-expanded',String(open));
   if(open)trigger.setAttribute('aria-controls','picker-'+source.id);
   controls.append(trigger);
  }
  if(linked){
   const relationship=el('span',t('{0} linked versions',group.length),{className:'link-state'});
   relationship.append(button(t('Unlink'),()=>change(()=>{
    for(const [i,row] of group.entries())for(const other of group.slice(i+1))separatePair(p,key,[row,other]);
    unlink(p,key,source.id);
   })));
   controls.append(relationship);
  }
  if(controls.childElementCount)heading.append(controls);
  item.append(heading);
  if(open&&trigger)item.append(variantPicker(p,key,entries,source,index+1,trigger));
  for(const [versionIndex,row] of group.entries()){
   const version=el('div',undefined,{id:'variant-'+row.id,className:'version row-'+key});
   if(linked)version.append(el('div',t('Printed version {0}',versionIndex+1),{className:'version-heading'}));
   const fields=el('div',undefined,{className:'printed-fields'});
   rowFields(fields,p,key,row,{printed:true});
   const actions=el('div',undefined,{className:'version-actions'});
   if(job&&row!==p.jobs[0])actions.append(button(t('Make primary'),()=>change(()=>{
    if(open)picker=null;
    primary(p,row.id);
   })));
   actions.append(removeButton(p,key,row));
   version.append(fields,actions);
   renderProposals(version,p,key,{row});
   item.append(version);
  }
  container.append(item);
  if(indices?.[1]===index)container.append(pairPrompt(p,key,entries[indices[0]][0],source,indices.map(i=>i+1)));
 }
 renderProposals(container,p,key);
 return container;
}
function renderEditor(){
 const pane=$('#editor'),p=current();pane.replaceChildren();
 if(!p)return;
 if(picker?.person!==p.id)picker=null;
 const heading=el('div',undefined,{className:'editor-heading'});
 heading.append(el('h2',t('Contact review')),reviewActions(p));pane.append(heading);
 const mainName=el('div',undefined,{className:'item version editor-fields'});
 field(mainName,'Main name (printed names, separated by spaces)',displayName(p),v=>{
  manualChange(p,'display');p.display=v;contentChange(p);
 },{key:'display'});
 pane.append(mainName);
 for(const view of [...keys.filter(k=>k!=='socials'),'linkedin','whatsapp','socials']){
  if(['jobs','addresses'].includes(view)){pane.append(variantSection(p,view));continue;}
  const service=['linkedin','whatsapp'].includes(view)?view:null,key=service?'socials':view;
  const label=service==='linkedin'?'LinkedIn':service==='whatsapp'?'WhatsApp':fieldNames[key];
  const container=section(p,key,label??key[0].toUpperCase()+key.slice(1),label??key,service?{label:service}:{});
  if(key==='wechats')container.append(el('p',t('WeChat IDs are preserved in Monica Notes on import.'),{className:'hint'}));
  for(const record of p[key]){
   if(key==='socials'&&view!==socialView(record))continue;
   const version=el('div',undefined,{className:'version'});
   const row=el('div',undefined,{className:'row row-'+key+(service?' row-'+service:'')});
   if(service==='whatsapp'){
    const label=el('label',t('Number source')),select=el('select');
    select.append(el('option',t('Independent number'),{value:''}));
    for(const phone of p.phones)select.append(el('option',phone.label+' '+phone.value,{value:phone.id}));
    select.value=record.phoneId??'';
    select.onchange=()=>change(()=>{manualChange(p,key,record);associate(p,record.id,select.value);});
    label.append(select);row.append(label);
   }
   rowFields(row,p,key,record,{service});
   const actions=el('div',undefined,{className:'row-actions'});
   actions.append(removeButton(p,key,record));
   row.append(actions);version.append(row);
   renderProposals(version,p,key,{row:record,view});
   container.append(version);
  }
  renderProposals(container,p,key,{view});
  pane.append(container);
 }
 const nicknames=el('div',undefined,{className:'item version editor-fields'});
 nicknames.append(button(t('Add simplified variants'),()=>change(()=>{p.suppressed=[];addSimplified(p,convert);contentChange(p);})));
 field(nicknames,'Additional nicknames (comma separated)',p.nicknames,v=>{p.nicknames=v;contentChange(p);},{key:'nicknames'});
 const notes=el('div',undefined,{className:'item version editor-fields'});
 field(notes,'Notes',p.notes,v=>{editNotes(p,v);contentChange(p);},{type:'textarea',key:'notes'});
 renderProposals(notes,p,'notes');
 const firstMet=el('div',undefined,{className:'item first-met'});
 const firstMetHeading=el('div',undefined,{className:'field-heading item-heading'});
 firstMetHeading.append(el('h3',t('First met')));
 const firstMetFields=el('div',undefined,{className:'version first-met-fields'});
 for(const key of ['date','occasion','location','notes'])field(firstMetFields,key,p.firstMet[key],v=>{
  p.firstMet[key]=v;contentChange(p);
 },{key:'firstMet',column:key,type:key==='date'?'date':key==='notes'?'textarea':'text'});
 firstMet.append(firstMetHeading,firstMetFields);
 pane.append(nicknames,notes,firstMet,reviewActions(p));
}
$('#files').onchange=async e=>{const cards=[];for(const file of e.target.files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){status('Use JPEG, PNG or WebP, up to 12 MB per card.');continue;}const id=crypto.randomUUID();assets.set(id,{file,url:URL.createObjectURL(file),name:file.name,rotation:0});cards.push(id);}if(cards.length)change(s=>{for(const id of cards){const p=person(id);s.push(p);selection.add(p.id);active=p.id;}});e.target.value='';};
$('#all').onclick=()=>{for(const p of h.state)selection.add(p.id);render();};$('#none').onclick=()=>{selection.clear();render();};
$('#invert').onclick=()=>{for(const p of h.state)selection.has(p.id)?selection.delete(p.id):selection.add(p.id);render();};
$('#combine').onclick=()=>{if(selected().length<2)return status('Select at least two people to combine.');change(()=>{const ps=selected();active=ps[0].id;h.state=combine(h.state,ps.map(p=>p.id));selection.clear();selection.add(active);});};
$('#detach').onclick=()=>{const p=current();if(busy||!p)return;if(!cardSelection.size||cardSelection.size===p.cards.length)return status('Tick some, but not all, source cards on the open person before detaching.');change(s=>detach(s,p.id,[...cardSelection]));status('Selected cards detached into a new person. Undo is available.');};
$('#reviewSelected').onclick=()=>{
 if(busy)return;
 const ps=selected();if(!ps.length)return;
 const blocked=ps.filter(reviewProblem);
 if(blocked.length){
  const problem=reviewProblem(blocked[0]);
  active=blocked[0].id;render();
  return status('{0} selected {1} a main name or resolved extraction suggestions. Nothing was marked reviewed. {2}',blocked.length,blocked.length===1?'person needs':'people need',()=>t(problem));
 }
 if(ps.every(p=>p.reviewed))return status('All selected people are already reviewed.');
 change(()=>{for(const p of ps)p.reviewed=true;});
 status('{0} {1} marked reviewed. Undo is available.',ps.length,ps.length===1?'person':'people');
};
$('#deleteSelected').onclick=()=>deletePeople(selected());
$('#undo').onclick=()=>{h.undo();render();};$('#redo').onclick=()=>{h.redo();render();};
$('#batch').onclick=()=>{if(!selected().length)return status('Select people first.');$('#batchForm').reset();$('#batchDialog').showModal();};
$('#batchForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);change(s=>batch(s,[...selection],Object.fromEntries(['date','occasion','location','notes'].map(k=>[k,f.get(k)])),f.has('overwrite')));$('#batchDialog').close();status('First met details updated. Undo is available.');};
async function imageData(asset){if(!asset.rotation)return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(asset.file);});const img=await createImageBitmap(asset.file),canvas=document.createElement('canvas');const swap=asset.rotation%180!==0;canvas.width=swap?img.height:img.width;canvas.height=swap?img.width:img.height;const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(asset.rotation*Math.PI/180);ctx.drawImage(img,-img.width/2,-img.height/2);img.close();return canvas.toDataURL('image/jpeg',.95);}
$('#retry').onclick=()=>{retryOnly=true;$('#extract').click();};
$('#cancel').onclick=()=>{cancelled=true;controller?.abort();status('Cancelling extraction…');};
$('#extract').onclick=async()=>{
 if(!selected().length)return status('Select people to extract.');
 if(busy)return;
 busy=true;cancelled=false;render();
 const queue=selected().flatMap(p=>p.cards.map(card=>({owner:p.id,card})))
  .filter(task=>!retryOnly||outcomes.get(task.card)==='failed');
 retryOnly=false;
 let failed=0,done=0;
 for(const {owner,card} of queue){
  if(cancelled)break;
  const p=h.state.find(person=>person.id===owner);
  if(!p?.cards.includes(card))continue;
  const activeEdit=()=>{
   if(pendingEdit?.owner!==owner)return;
   const {key,rowId,identity}=pendingEdit;
   return {key,rowId,identity};
  };
  const atDispatch=activeEdit();
  status('Extracting {0} of {1}…',done+failed+1,queue.length);
  const request=new AbortController();
  controller=request;
  try{
   const image=await imageData(assets.get(card));
   if(request.signal.aborted)break;
   const response=await fetch('/extract',{
    method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':session.token},
    body:JSON.stringify({image}),signal:request.signal
   });
   const result=await response.json();
   if(request.signal.aborted||controller!==request)break;
   if(!response.ok)throw new UiError(result.uiKey??result.error??'Extraction failed.',...(result.uiValues??[]));
   const now=h.state.find(person=>person.id===owner);
   if(!now?.cards.includes(card))continue;
   const updated=structuredClone(now);
   if(reconcileRead(updated,card,result,convert,{draft:activeEdit(),atDispatch})){
    h.change(state=>{state[state.indexOf(now)]=updated;});
   }
   outcomes.set(card,'done');failures.delete(card);done++;
   render();
  }catch(e){
   if(request.signal.aborted||controller!==request)break;
   outcomes.set(card,'failed');failures.set(card,e);failed++;
   render();
  }
 }
 busy=false;controller=null;render();
 const wasCancelled=cancelled;
 status('{0}{1} completed; {2} failed. Select failed drafts to retry.',()=>wasCancelled?t('Stopped. '):'',done,failed);
};
function exportPeople(){if(busy)throw new UiError('Wait for extraction to finish, or cancel it before exporting.');const ps=selected();if(!ps.length)throw new UiError('No people selected. Tick their checkboxes in the list, or choose Select all reviewed people.');const pending=ps.filter(p=>!p.reviewed||p.suggestions.length);if(pending.length)throw new UiError('{0} of {1} selected people still need review. Resolve extraction suggestions, then tick Reviewed against source cards at the top or bottom of each contact form, or use Mark reviewed in the sidebar.',pending.length,ps.length);return ps;}
function exportFeedback(error){exportError=error;const message=localizeError(error);$('#exportError').textContent=message;$('#exportError').hidden=!message;$('#combined').disabled=exporting||!!message;$('#individual').disabled=exporting||!!message;}
function downloadFilename(extension){
 const name=$('#exportFilename').value.trim().replace(/\.(vcf|zip)$/i,'').trim();
 if(!name)throw new UiError('Enter a download filename.');
 if(/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name))throw new UiError('Use a valid filename without path separators or Windows reserved names/characters.');
 return name+'.'+extension;
}
const modeHelp=()=>t($('#mode').value==='structured'?'Includes job status, language links and contact-method associations for modified Monica. Importer integration is pending.':'Stock Monica mapping: primary job and Notes fallbacks. Job status, language links and phone associations require Structured mode.');
function setExportNotice(key,...values){
 exportMessage=key?()=>t(key,...values):null;
 $('#exportNotice').textContent=exportMessage?.()??'';
}
function preview(){
 setExportNotice();$('#modeHelp').textContent=modeHelp();
 $('#goReview').disabled=!selected().some(p=>!p.reviewed||p.suggestions.length);
 $('#selectReviewed').disabled=!h.state.some(p=>p.reviewed&&!p.suggestions.length);
 try{const ps=exportPeople(),filename=downloadFilename('vcf'),cards=ps.flatMap(p=>p.cards);$('#preview').textContent=ps.map(p=>vcard(p,$('#mode').value)).join('\n');exportFeedback();if(exporting)setExportNotice('Preparing download with original images…');else setExportNotice('{0} reviewed contact(s) ready, including {1} original image(s). Download {2} or {3} below.',ps.length,cards.length,filename,downloadFilename('zip'));}
 catch(e){$('#preview').textContent='';exportFeedback(e);}
}
$('#export').onclick=()=>{$('#exportDialog').showModal();preview();};$('#mode').onchange=preview;
$('#exportFilename').oninput=preview;
$('#selectReviewed').onclick=()=>{selection.clear();for(const p of h.state)if(p.reviewed&&!p.suggestions.length)selection.add(p.id);render();preview();};
$('#goReview').onclick=()=>{const p=selected().find(p=>!p.reviewed||p.suggestions.length);if(!p)return;$('#exportDialog').close();active=p.id;render();const target=p.suggestions.length?$('#editor .suggestion, #images .suggestion'):$('#editor .review');target?.scrollIntoView({block:'center',behavior:'smooth'});if(!p.suggestions.length)target?.querySelector('input')?.focus({preventScroll:true});};
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=el('a',undefined,{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exported(ps){for(const p of ps)exports.set(p.uid,signature(p));updateWarning();status('Download requested. Check that your browser saved the file before closing.');setExportNotice('Download requested. Check your browser Downloads (Ctrl+J); keep this session open until the file is saved.');}
async function exportDownload(individual){
 if(exporting)return;
 let error;
 try{
  const ps=structuredClone(exportPeople()),filename=downloadFilename(individual?'zip':'vcf'),mode=$('#mode').value;
  // Snapshot original Files before awaiting: edits/deletion during preparation must not change this export.
  const sources=ps.map(p=>p.cards.map(id=>{const a=assets.get(id);if(!a)throw new UiError('A source image is unavailable. Keep this session open and retry.');return {file:a.file,rotation:0};}));
  exporting=true;exportFeedback();updateWarning();setExportNotice('Preparing download with original images…');
  const cards=[];
  for(let i=0;i<ps.length;i++){const photos=[];for(const source of sources[i])photos.push(await imageData(source));cards.push(vcard(ps[i],mode,photos));}
  if(individual){const files={};ps.forEach((p,i)=>{const name=displayName(p).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,65)||'contact';files[`${name}-${p.uid}.vcf`]=strToU8(cards[i]);});download(zipSync(files),filename,'application/zip');}
  else download(cards.join(''),filename,'text/vcard;charset=utf-8');
  exported(ps);
 }catch(e){
  error=e instanceof Error?e:new UiError('Could not read an original image. No download was created.');
  setExportNotice();
 }
 finally{exporting=false;exportFeedback(error);updateWarning();}
}
$('#combined').onclick=()=>exportDownload(false);
$('#individual').onclick=()=>exportDownload(true);
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
$('#showSetup').onclick=()=>$('#setupDialog').showModal();
const leave=e=>{e.preventDefault();e.returnValue='';};let warned=false;
function updateWarning(){const dirty=pendingEdit||busy||exporting||h.state.some(p=>p.suggestions.length>0||exports.get(p.uid)!==signature(p));if(dirty&&!warned){window.addEventListener('beforeunload',leave);warned=true;}if(!dirty&&warned){window.removeEventListener('beforeunload',leave);warned=false;}}
render();status('Ready · model {0}. Add card images to begin.',session.model);

function setModelMessage(format){
 modelMessage=format;
 $('#modelStatus').textContent=modelMessage();
}
setModelMessage(()=>t('Model connection not checked.'));
$('#checkModel').onclick=async()=>{
 const b=$('#checkModel'),label=$('#modelStatus');b.disabled=true;setModelMessage(()=>t('Checking model…'));label.dataset.state='checking';
 try{const response=await fetch('/model-status',{headers:{'X-Session-Token':session.token}});if(!response.ok)throw Error();const result=await response.json();const checked=new Date();setModelMessage(()=>t('{0} (last checked {1})',t(result.uiKey??result.message,...(result.uiValues??[])),checked.toLocaleTimeString(language)));label.dataset.state=result.state;}
 catch{setModelMessage(()=>t('Cannot check model. Confirm the card2vcf app server is still running.'));label.dataset.state='error';}
 finally{b.disabled=false;}
};
