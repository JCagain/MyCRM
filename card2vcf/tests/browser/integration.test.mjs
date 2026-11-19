import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';
import ICAL from 'ical.js';
import {unzipSync,strFromU8} from 'fflate';
import {createApp} from '../../server.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==','base64');
const images=[png,Buffer.concat([png,Buffer.from('fictional second image')])];
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));

test('integration controls, metadata history, all downloads and fictional re-extraction',{timeout:60000},async()=>{
 const data={names:['Fictional Person'],jobs:[{company:'Example',title:'Advisor',status:'former',alternativeGroupId:'untrusted'},{company:'\u793a\u4f8b',title:'\u987e\u95ee'},{company:'Former Example',title:'Researcher'}],addresses:[{street:'1 Example Road'},{street:'\u793a\u4f8b\u8def1\u53f7'}],phones:[{label:'work',value:'555-0100'}],socials:[{label:'LinkedIn',value:'fictional-profile'},{label:'WhatsApp',value:'555-0100',phoneId:'untrusted'},{label:'WhatsApp',value:'555-0199'},{label:'Other service',value:'fictional-other'}]};
 const fake=http.createServer(async(req,res)=>{for await(const chunk of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}));});
 const endpoint=await listen(fake),app=createApp({endpoint:endpoint+'/v1',model:'fictional',key:''}),url=await listen(app);let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
  await page.locator('#files').setInputFiles(images.map((buffer,i)=>({name:`fictional-${i}.png`,mimeType:'image/png',buffer})));
  await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2 completed'));await page.locator('#combine').click();
  const jobs=page.locator('.row-jobs'),addresses=page.locator('.row-addresses'),reviews=page.getByLabel('Reviewed against source cards');
  const whatsapp=page.locator('.field-section').filter({has:page.getByRole('heading',{name:'WhatsApp',exact:true})}),wa=whatsapp.locator('.row-socials');
  assert.equal(await jobs.count(),3);assert.equal(await jobs.first().getByLabel('Job status').inputValue(),'current');assert.equal(await wa.first().getByLabel('Number source').inputValue(),'');
  await jobs.nth(1).getByLabel('Job status').selectOption('former');
  await jobs.nth(0).getByLabel('Select variant').check();await jobs.nth(1).getByLabel('Select variant').check();
  await page.locator('.field-section').filter({has:page.getByRole('heading',{name:'Jobs',exact:true})}).getByRole('button',{name:'Link selected language variants'}).click();
  assert.match(await page.locator('#status').textContent(),/same status/);assert.equal(await page.locator('[data-language-group]').count(),0);
  await jobs.nth(1).getByLabel('Job status').selectOption('current');await reviews.first().check();
  await page.locator('.field-section').filter({has:page.getByRole('heading',{name:'Jobs',exact:true})}).getByRole('button',{name:'Link selected language variants'}).click();assert.equal(await reviews.first().isChecked(),false);
  await jobs.first().getByLabel('Job status').selectOption('unspecified');assert.equal(await jobs.nth(1).getByLabel('Job status').inputValue(),'unspecified');
  await jobs.first().getByLabel('Job status').selectOption('current');assert.equal(await jobs.nth(1).getByLabel('Job status').inputValue(),'current');
  await jobs.nth(2).getByLabel('Job status').selectOption('former');await jobs.nth(1).getByRole('button',{name:'Make primary'}).click();assert.equal(await jobs.first().getByLabel('company',{exact:true}).inputValue(),'\u793a\u4f8b');
  for(let i=0;i<2;i++)await addresses.nth(i).getByLabel('Select variant').check();
  await page.locator('.field-section').filter({has:page.getByRole('heading',{name:'Addresses',exact:true})}).getByRole('button',{name:'Link selected language variants'}).click();
  await wa.first().getByLabel('Number source').selectOption({index:1});
  const phone=page.locator('.row-phones').first().getByLabel('value',{exact:true});await phone.fill('555-0111');await phone.press('Tab');assert.equal(await wa.first().getByLabel('value',{exact:true}).inputValue(),'555-0111');
  await page.locator('.row-phones').first().getByRole('button',{name:'Remove',exact:true}).click();assert.equal(await wa.first().getByLabel('Number source').inputValue(),'');assert.equal(await wa.first().getByLabel('value',{exact:true}).inputValue(),'555-0111');
  await page.locator('#undo').click();assert.notEqual(await wa.first().getByLabel('Number source').inputValue(),'');await page.locator('#redo').click();await page.locator('#undo').click();
  for(const width of [1440,800,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow at ${width}`);assert.equal(await wa.first().getByLabel('Number source').isVisible(),true);}
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Add jobs',exact:true}).click();
  assert.equal(await jobs.last().getByLabel('Job status').inputValue(),'current');
  await reviews.first().check();await page.locator('#export').click();
  const downloads=new Map();
  for(const mode of ['monica','structured'])for(const zip of [false,true]){
   await page.locator('#mode').selectOption(mode);const saving=page.waitForEvent('download');await page.locator(zip?'#individual':'#combined').click();const bytes=await readFile(await(await saving).path());
   const text=zip?strFromU8(Object.values(unzipSync(bytes))[0]):bytes.toString('utf8');const card=new ICAL.Component(ICAL.parse(text));
   if(process.env.C2V_HANDOFF_DIRECTORY){
    await mkdir(process.env.C2V_HANDOFF_DIRECTORY,{recursive:true});
    await writeFile(path.join(process.env.C2V_HANDOFF_DIRECTORY,`${mode}-${zip?'individual.zip':'combined.vcf'}`),bytes);
    if(zip)await writeFile(path.join(process.env.C2V_HANDOFF_DIRECTORY,`${mode}-zip-entry.vcf`),text);
   }
   if(zip)assert.equal(text,downloads.get(mode));else downloads.set(mode,text);
   assert.equal(card.getAllProperties('org').length,mode==='structured'?3:1);
   assert.match(card.getFirstPropertyValue('note'),/whatsapp: 555-0111/i);assert.match(card.getFirstPropertyValue('note'),/fictional-other/);
   assert.doesNotMatch(card.getFirstPropertyValue('note'),/Other job: *— *(?:\n|$)/);
   if(mode==='structured'){assert.deepEqual(card.getAllProperties('x-c2v-job-status').map(r=>r.getFirstValue()),['current','former']);assert.equal(card.getAllProperties('org')[0].getParameter('altid'),'job1-org');const social=card.getAllProperties('x-socialprofile');assert.equal(social.length,3);assert.equal(social[1].getParameter('x-c2v-phone'),'phone1');assert.equal(social[1].getFirstValue(),'555-0111');assert.equal(social[2].getParameter('x-c2v-phone'),undefined);}
   const photos=card.getAllProperties('photo');assert.equal(photos.length,2);photos.forEach((photo,i)=>assert.deepEqual(Buffer.from(photo.getFirstValue().split(',')[1],'base64'),images[i]));
  }
  await page.locator('#exportDialog [data-close]').click();
  await jobs.last().getByRole('button',{name:'Remove',exact:true}).click();
  await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2 completed'));
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'Accept additional values',exact:true}).first().click();
  assert.equal(await reviews.first().isChecked(),false);assert.equal(await jobs.first().getByLabel('Job status').inputValue(),'current');assert.notEqual(await wa.first().getByLabel('Number source').inputValue(),'');
  assert.equal(await jobs.count(),3);assert.equal(await wa.count(),2);
  assert.equal(await jobs.filter({has:page.getByText('Linked language variant',{exact:true})}).count(),2);
  await jobs.first().getByRole('button',{name:'Unlink language variants'}).click();assert.equal(await jobs.filter({has:page.getByText('Linked language variant',{exact:true})}).count(),0);
  await page.locator('#undo').click();assert.equal(await jobs.filter({has:page.getByText('Linked language variant',{exact:true})}).count(),2);await page.locator('#redo').click();
  await page.locator('#images input[type=checkbox]').first().check();await page.locator('#detach').click();assert.equal(await page.locator('#people .person').count(),2);await page.locator('#undo').click();assert.equal(await page.locator('#people .person').count(),1);await page.locator('#redo').click();assert.equal(await page.locator('#people .person').count(),2);
  const waiting=page.waitForEvent('dialog'),reloading=page.reload({timeout:2000}).catch(()=>{});const dialog=await waiting;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();await reloading;assert.equal(await page.locator('#people .person').count(),2);
  page.once('dialog',d=>d.accept());await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));assert.equal(await page.locator('#people .person').count(),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();app.closeAllConnections();app.close();fake.closeAllConnections();fake.close();}
});
