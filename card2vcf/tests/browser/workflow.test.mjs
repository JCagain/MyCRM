import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {chromium} from '@playwright/test';import {createApp} from '../../server.mjs';
import {readFile} from 'node:fs/promises';import ICAL from 'ical.js';import {unzipSync,strFromU8} from 'fflate';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(`http://127.0.0.1:${s.address().port}`)));
async function assertDownloadPhotos(download,zip,counts){
 const bytes=await readFile(await download.path()),texts=zip?Object.values(unzipSync(bytes)).map(bytes=>strFromU8(bytes)):[bytes.toString('utf8')];
 const entries=texts.flatMap(text=>text.match(/BEGIN:VCARD[\s\S]*?END:VCARD\r\n/g)||[]);
 assert.equal(entries.length,counts.length);
 entries.forEach((text,i)=>{const photos=new ICAL.Component(ICAL.parse(text)).getAllProperties('photo');assert.equal(photos.length,counts[i]);for(const photo of photos){const uri=photo.getFirstValue();assert.ok(uri.startsWith('data:image/png;base64,'));assert.deepEqual(Buffer.from(uri.split(',')[1],'base64'),png);}});
}
test('compact review, selected batch actions, detach and personalized downloads',async()=>{
 let calls=0;
 const fake=http.createServer(async(req,res)=>{
  for await(const c of req){}calls++;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({names:['Fictional Person '+calls],phones:[{label:'work',value:'555-010'+calls}],jobs:[{company:'Example',title:'Tester'}],socials:[{label:'WhatsApp',value:'555-010'+calls}]})}}]}));
 });
 const endpoint=await listen(fake),app=createApp({endpoint:endpoint+'/v1',model:'fictional',key:''}),url=await listen(app);let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
  assert.equal(await page.locator('header #batch').count(),0);
  assert.equal(await page.locator('aside #batch').count(),1);
  assert.equal(await page.locator('#export').textContent(),'Export');
  assert.deepEqual(await page.locator('aside > .actions, aside > .selection-count').allTextContents(),[
   'Select allClearInvert selection','0 people selected','LinkDetach','Mark reviewedDelete','Set first met'
  ]);
  assert.equal(await page.locator('#selectionCount').evaluate(count=>getComputedStyle(count).fontSize),'16px');
  assert.equal(await page.locator('#files').isVisible(),false,'Add cards hides the native file input');
  await page.locator('#files').setInputFiles(['one','two','three'].map(name=>({name:name+'.png',mimeType:'image/png',buffer:png})));
  await page.locator('#reviewSelected').click();assert.match(await page.locator('#status').textContent(),/Nothing was marked reviewed/);
  await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('3 completed'));
  await page.locator('#people .person button').nth(2).click();
  const reviews=page.getByLabel('Reviewed against source cards');assert.equal(await reviews.count(),2);
  assert.equal(await page.locator('.editor-heading').getByRole('button',{name:'Delete person',exact:true}).count(),1);
  const phone=page.locator('.row-phones').first();
  const job=page.locator('#editor .framed .item').first();
  const contactGroups=page.locator('#editor .contact-fields');
  assert.deepEqual(await contactGroups.locator('h3').allTextContents(),['Names','Phones','Emails','WeChat','Websites','LinkedIn','WhatsApp','Socials']);
  const frameStyle=element=>{const style=getComputedStyle(element);return [style.borderColor,style.borderRadius];};
  const background=element=>getComputedStyle(element).backgroundColor;
  assert.deepEqual(await contactGroups.first().evaluate(frameStyle),await job.evaluate(frameStyle));
  const jobHeaderColor=await job.locator('.item-heading').evaluate(background);
  const otherHeaders=page.locator('#editor .contact-fields>.item-heading, #editor .first-met>.item-heading');
  assert.deepEqual(await otherHeaders.evaluateAll(elements=>elements.map(element=>getComputedStyle(element).backgroundColor)),Array(9).fill(jobHeaderColor));
  const firstMet=page.locator('.first-met-fields');
  const whatsapp=page.locator('.row-whatsapp').first();
  for(const width of [1440,1100,800,390]){
   await page.setViewportSize({width,height:1000});
   const combineBox=await page.locator('#combine').boundingBox(),detachBox=await page.locator('#detach').boundingBox();
   assert.equal(combineBox.y,detachBox.y,`Link and Detach share a row at ${width}px`);
   const reviewBox=await page.locator('#reviewSelected').boundingBox(),deleteBox=await page.locator('#deleteSelected').boundingBox();
   assert.equal(reviewBox.y,deleteBox.y,`Mark reviewed and Delete share a row at ${width}px`);
   const boxes=await Promise.all([phone.locator('.field-label input').boundingBox(),phone.locator('.field-value input').boundingBox(),phone.getByRole('button',{name:'Remove',exact:true}).boundingBox()]);
   assert.ok(Math.abs(boxes[0].y-boxes[1].y)<2,`phone fields share a row at ${width}px`);
   assert.ok(Math.abs(boxes[0].y+boxes[0].height-boxes[2].y-boxes[2].height)<2,`Remove shares the row at ${width}px`);
   const firstMetColumns=await firstMet.evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length);
   if(width===1440||width===390)assert.equal(firstMetColumns,width===1440?3:2);
   if(width===390){
    const source=await whatsapp.getByLabel('Number source').boundingBox(),number=await whatsapp.getByLabel('value',{exact:true}).boundingBox();
    assert.ok(source.y<number.y&&source.width>number.width,'WhatsApp source gets its own full-width row on mobile');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no page overflow at ${width}px`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await reviews.first().check();assert.equal(await reviews.last().isChecked(),true);
  await reviews.last().uncheck();assert.equal(await reviews.first().isChecked(),false);
  await page.locator('#none').click();await page.locator('#people input').nth(0).check();await page.locator('#people input').nth(1).check();
  await page.locator('#reviewSelected').click();
  assert.equal(await page.locator('#selectionCount').textContent(),'2 people selected');
  assert.equal(await page.locator('#people small').filter({hasText:'· Reviewed'}).count(),2);
  assert.equal(await reviews.first().isChecked(),false,'open unselected person is unaffected');
  await page.locator('#undo').click();assert.equal(await page.locator('#people small').filter({hasText:'· Reviewed'}).count(),0);
  await page.locator('#redo').click();assert.equal(await page.locator('#people small').filter({hasText:'· Reviewed'}).count(),2);
  await page.locator('#export').click();
  for(const name of ['', '../cards', 'CON', 'cards.']){
   await page.getByLabel('Download filename').fill(name);assert.equal(await page.locator('#combined').isDisabled(),true);assert.equal(await page.locator('#exportError').isVisible(),true);
  }
  await page.getByLabel('Download filename').fill('会议 cards.vcf');
  let saving=page.waitForEvent('download');await page.locator('#combined').click();let downloaded=await saving;assert.equal(downloaded.suggestedFilename(),'会议 cards.vcf');await assertDownloadPhotos(downloaded,false,[1,1]);
  saving=page.waitForEvent('download');await page.locator('#individual').click();downloaded=await saving;assert.equal(downloaded.suggestedFilename(),'会议 cards.zip');await assertDownloadPhotos(downloaded,true,[1,1]);
  await page.locator('#exportDialog [data-close]').click();
  page.once('dialog',d=>d.dismiss());await page.locator('#deleteSelected').click();assert.equal(await page.locator('#people .person').count(),3);
  page.once('dialog',d=>{assert.match(d.message(),/2 selected people/);return d.accept();});
  await page.locator('#deleteSelected').click();assert.equal(await page.locator('#people .person').count(),1);
  assert.match(await page.locator('#people').textContent(),/Fictional Person 3/);
  await page.locator('#undo').click();assert.equal(await page.locator('#people .person').count(),3);
  await page.locator('#redo').click();assert.equal(await page.locator('#people .person').count(),1);
  await page.locator('#undo').click();
  await page.locator('#none').click();await page.locator('#people input').nth(0).check();await page.locator('#people input').nth(1).check();
  await page.locator('#combine').click();assert.equal(await page.locator('#people .person').count(),2);
  await page.locator('#detach').click();assert.match(await page.locator('#status').textContent(),/some, but not all/);
  await page.locator('#images input[type=checkbox]').first().check();
  const main=page.getByLabel('Main name (printed names, separated by spaces)');await main.fill('Combined example');await main.press('Tab');
  assert.equal(await page.locator('#images input[type=checkbox]').first().isChecked(),true,'card selection survives editing');
  await page.locator('#detach').click();assert.equal(await page.locator('#people .person').count(),3);
  await page.locator('#undo').click();assert.equal(await page.locator('#images .card').count(),2);
  await page.locator('#redo').click();assert.equal(await page.locator('#people .person').count(),3);
  await page.locator('#all').click();await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('3 completed'));
  await page.locator('#reviewSelected').click();assert.match(await page.locator('#status').textContent(),/Nothing was marked reviewed/);assert.match(await page.locator('#status').textContent(),/suggestions/);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();app.closeAllConnections();app.close();fake.closeAllConnections();fake.close();}
});
test('fictional browser workflow: extract, combine, undo, edit, export, warning and reset',async()=>{
 const fake=http.createServer(async(req,res)=>{if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({data:[{id:'fictional'}]}));}for await(const c of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({names:['陳大文','David Chan'],jobs:[{company:'Fictional Company',title:'Advisor'}]})}}]}));});const endpoint=await listen(fake);const app=createApp({endpoint:endpoint+'/v1',model:'fictional',key:''});const url=await listen(app);let browser;
 try{browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
 await page.locator('#checkModel').click();await page.waitForFunction(()=>document.querySelector('#modelStatus').dataset.state==='connected');await page.locator('#files').setInputFiles([{name:'fictional-a.png',mimeType:'image/png',buffer:png},{name:'fictional-b.png',mimeType:'image/png',buffer:png}]);await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2 completed'));
 assert.equal(await page.locator('#people .person').count(),2);await page.locator('#combine').click();assert.equal(await page.locator('#people .person').count(),1);await page.locator('#undo').click();assert.equal(await page.locator('#people .person').count(),2);await page.locator('#redo').click();assert.equal(await page.locator('#people .person').count(),1);
 await page.locator('#export').click();assert.equal(await page.locator('#exportDialog').isVisible(),true);assert.match(await page.locator('#exportError').textContent(),/still need review/);assert.equal(await page.locator('#combined').isDisabled(),true);await page.locator('#goReview').click();assert.equal(await page.locator('#exportDialog').isVisible(),false);
 const names=page.locator('.row-names');
 assert.deepEqual(await names.locator('small').allTextContents(),['Generated simplified']);
 const generated=names.filter({hasText:'Generated simplified'});
 assert.equal(await generated.getByRole('textbox',{name:'value',exact:true}).inputValue(),'陈大文');
 assert.equal(await generated.locator('.field-value small').count(),1);
 await page.locator('#uiLanguage').selectOption('zh-CN');
 assert.deepEqual(await names.locator('small').allTextContents(),['生成的简体姓名']);
 await page.locator('#uiLanguage').selectOption('en');
 const main=page.getByLabel('Main name (printed names, separated by spaces)');assert.equal(await main.inputValue(),'陳大文 David Chan');await main.fill('陳大文 David Chan Edited');await main.press('Tab');await page.getByLabel('Reviewed against source cards').first().check();
 await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2 completed'));assert.equal(await main.inputValue(),'陳大文 David Chan Edited');
 assert.equal(await page.locator('.suggestion').count(),0);assert.equal(await page.getByLabel('Reviewed against source cards').first().isChecked(),true);
 await page.locator('#batch').click();await page.locator('#batchForm input[name=occasion]').fill('Fictional conference');await page.locator('#batchForm button[type=submit], #batchForm button:not([type])').click();assert.equal(await page.getByLabel('Reviewed against source cards').first().isChecked(),true);
 await page.getByRole('button',{name:'Rotate',exact:true}).first().click();await page.locator('#export').click();assert.ok((await page.locator('#preview').textContent()).includes('NICKNAME:陈大文'));assert.equal((await page.locator('#preview').textContent()).includes('base64'),false);const downloadEvent=page.waitForEvent('download');await page.locator('#individual').click();const download=await downloadEvent;assert.equal(download.suggestedFilename(),'contacts.zip');await assertDownloadPhotos(download,true,[2]);await page.locator('#exportDialog [data-close]').click();
 await main.fill('陳大文 David Chan Changed');await main.press('Tab');const dialogEvent=page.waitForEvent('dialog');const reloading=page.reload({timeout:2000}).catch(()=>{});const dialog=await dialogEvent;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();await reloading;assert.equal(await page.locator('#people .person').count(),1);
 page.once('dialog',d=>d.accept());await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));assert.equal(await page.locator('#people .person').count(),0);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();app.closeAllConnections();app.close();fake.closeAllConnections();fake.close();}
});

test('retry only failures and keep warning after partial export',async()=>{
 let calls=0;const fake=http.createServer(async(req,res)=>{if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({data:[{id:'fictional'}]}));}for await(const c of req){}calls++;res.setHeader('Content-Type','application/json');if(calls===2){res.statusCode=500;return res.end('{}');}res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({names:['Fictional Contact '+calls]})}}]}));});const endpoint=await listen(fake),app=createApp({endpoint:endpoint+'/v1',model:'fictional',key:''}),url=await listen(app);let browser;
 try{browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({acceptDownloads:true});await page.goto(url);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));await page.locator('#files').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:png},{name:'two.png',mimeType:'image/png',buffer:png}]);await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('1 failed'));assert.equal(calls,2);await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('1 completed; 0 failed'));assert.equal(calls,3);await page.getByLabel('Reviewed against source cards').first().check();await page.locator('#none').click();await page.locator('#people input[type=checkbox]').nth(1).check();await page.locator('#export').click();const saving=page.waitForEvent('download');await page.locator('#combined').click();await saving;await page.locator('#exportDialog [data-close]').click();const waiting=page.waitForEvent('dialog'),reloading=page.reload({timeout:2000}).catch(()=>{});const dialog=await waiting;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();await reloading;assert.equal(await page.locator('#people .person').count(),2);
 }finally{await browser?.close();app.closeAllConnections();app.close();fake.closeAllConnections();fake.close();}
});
