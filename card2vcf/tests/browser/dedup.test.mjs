import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import ICAL from 'ical.js';
import {unzipSync,strFromU8} from 'fflate';
import {createApp} from '../../server.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
test('invert selection, combined bilingual fields, WeChat editing, downloads and detach',{timeout:45000},async()=>{
 let calls=0,browser;
 const fake=http.createServer(async(req,res)=>{
  for await(const chunk of req){}calls++;const second=calls%2===0;
  const data={names:['Fictional Person'],jobs:[{company:second?'\u793a\u4f8b\u516c\u53f8\nExample Company':'\u793a\u4f8b\u516c\u53f8 Example Company',title:'Advisor'}],phones:[{label:'work',value:'555-0100'}],emails:[{label:second?'email':'\u7535\u90ae',value:'fictional@example.invalid'}],addresses:[{label:second?'address':'\u5730\u5740',street:'\u793a\u4f8b\u8def1\u53f7 1 Example Road',city:'Example City'}],socials:[{label:second?'WeChat':'VX',value:'fictional_wechat'}],notes:'Shared fictional note.'};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}));
 });
 const endpoint=await listen(fake),app=createApp({endpoint:endpoint+'/v1',model:'fictional',key:''}),url=await listen(app);
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
  await page.locator('#invert').click();assert.equal(await page.locator('#selectionCount').textContent(),'0 people selected');
  await page.locator('#files').setInputFiles(['front','back'].map(name=>({name:name+'.png',mimeType:'image/png',buffer:png})));
  const active=await page.locator('#people .active button').textContent();await page.locator('#invert').click();assert.equal(await page.locator('#people input:checked').count(),0);assert.equal(await page.locator('#people .active button').textContent(),active);
  await page.locator('#people input').first().check();await page.locator('#invert').click();assert.deepEqual(await page.locator('#people input').evaluateAll(inputs=>inputs.map(input=>input.checked)),[false,true]);
  await page.locator('#invert').click();assert.deepEqual(await page.locator('#people input').evaluateAll(inputs=>inputs.map(input=>input.checked)),[true,false]);await page.locator('#all').click();
  await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2 completed'));
  await page.locator('#combine').click();assert.equal(await page.locator('#people .person').count(),1);
  for(const key of ['names','jobs','phones','emails','wechats','addresses'])assert.equal(await page.locator('.row-'+key).count(),1,key);
  assert.equal(await page.locator('.row-socials').count(),0);assert.equal(await page.locator('#editor').getByLabel('Notes',{exact:true}).inputValue(),'Shared fictional note.');
  const headings=await page.locator('.field-heading h3').allTextContents();assert.equal(headings[headings.indexOf('Emails')+1],'WeChat');
  const rows=page.locator('.row-wechats'),values=rows.locator('.field-value input');assert.equal(await values.first().inputValue(),'fictional_wechat');
  for(const width of [1440,800,390]){
   await page.setViewportSize({width,height:1000});const row=rows.first(),boxes=await Promise.all([row.locator('.field-label input').boundingBox(),row.getByLabel('ID / number').boundingBox(),row.getByRole('button',{name:'Remove',exact:true}).boundingBox()]);
   assert.ok(Math.abs(boxes[0].y-boxes[1].y)<2);assert.ok(Math.abs(boxes[0].y+boxes[0].height-boxes[2].y-boxes[2].height)<2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('#undo').click();assert.equal(await page.locator('#people .person').count(),2);await page.locator('#redo').click();assert.equal(await page.locator('.row-emails').count(),1);
  await values.first().fill('fictional_edited');await values.first().press('Tab');await page.getByRole('button',{name:'Add WeChat',exact:true}).click();
  await values.nth(1).fill('fictional_manual');await values.nth(1).press('Tab');await rows.nth(1).getByRole('button',{name:'Remove',exact:true}).click();assert.equal(await rows.count(),1);await page.locator('#undo').click();assert.equal(await rows.count(),2);await page.locator('#redo').click();assert.equal(await rows.count(),1);
  await page.getByLabel('Reviewed against source cards').first().check();await page.locator('#export').click();
  for(const zip of [false,true]){
   const waiting=page.waitForEvent('download');await page.locator(zip?'#individual':'#combined').click();const bytes=await readFile(await (await waiting).path()),text=zip?strFromU8(Object.values(unzipSync(bytes))[0]):bytes.toString('utf8'),parsed=new ICAL.Component(ICAL.parse(text));
   for(const prop of ['email','tel','adr','org','x-wechat'])assert.equal(parsed.getAllProperties(prop).length,1,prop);assert.equal(parsed.getFirstPropertyValue('x-wechat'),'fictional_edited');assert.match(parsed.getFirstPropertyValue('note'),/WeChat: fictional_edited/);assert.equal(parsed.getAllProperties('photo').length,2);
  }
  await page.locator('#exportDialog [data-close]').click();
  await page.locator('#extract').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2 completed'));assert.equal(await page.locator('.suggestion').count(),2);assert.equal(await values.first().inputValue(),'fictional_edited');
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'Accept additional values',exact:true}).first().click();assert.equal(await rows.count(),2);assert.equal(await page.locator('.row-emails').count(),1);assert.equal(await page.locator('.row-jobs').count(),1);
  await page.locator('#images input[type=checkbox]').first().check();await page.locator('#detach').click();assert.equal(await page.locator('#people .person').count(),2);
  for(let i=0;i<2;i++){await page.locator('#people .person button').nth(i).click();for(const key of ['names','emails','jobs','addresses'])assert.equal(await page.locator('.row-'+key).count(),1,key);assert.equal(await page.locator('#images .card').count(),1);}
  await page.locator('#undo').click();assert.equal(await page.locator('#people .person').count(),1);await page.locator('#redo').click();assert.equal(await page.locator('#people .person').count(),2);assert.deepEqual(errors,[]);
 }finally{await browser?.close();app.closeAllConnections();app.close();fake.closeAllConnections();fake.close();}
});
