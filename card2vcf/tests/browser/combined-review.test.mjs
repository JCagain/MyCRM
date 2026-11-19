import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from '@playwright/test';
import {createApp} from '../../server.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const files=(...names)=>names.map(name=>({name:name+'.png',mimeType:'image/png',buffer:png}));
const front={
 names:['Fictional Reviewer'],jobs:[{company:'Lantern Studio',title:'Designer'}],addresses:[{street:'1 Sample Road'}],
 phones:[{value:'555-0100'}],emails:[{value:'reviewer@example.invalid'}]
};
const back={
 names:front.names,jobs:[{company:'範例工作室',title:'設計師'}],addresses:[{street:'範例路1號'}],
 phones:front.phones,emails:front.emails,websites:[{value:'https://unclear.example.invalid'}],
 wechats:[{value:'fictional_review'}],fieldWarnings:[{field:'websites',index:0,message:'Check the website.'}],
 warnings:['Check the image quality.']
};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
async function session(t,timeout){
 const requests=[],arrivals=[];
 const fake=http.createServer(async(req,res)=>{
  for await(const chunk of req){}
  const reply=(data,status=200)=>{
   res.statusCode=status;
   res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}));
  };
  const index=requests.push(reply)-1;
  arrivals[index]?.(reply);
 });
 const endpoint=await listen(fake),app=createApp({endpoint:endpoint+'/v1',model:'fictional',key:'',timeout});
 const url=await listen(app);
 let browser;
 t.after(async()=>{await browser?.close();for(const server of [app,fake]){server.closeAllConnections();server.close();}});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
 return {page,errors,request:index=>new Promise(resolve=>requests[index]?resolve(requests[index]):arrivals[index]=resolve)};
}
const statusContains=(page,value)=>page.waitForFunction(text=>document.querySelector('#status').textContent.includes(text),value,{timeout:8000});

test('combined first reads apply independently and review pairs appear during a batch',{timeout:45000},async t=>{
 const {page,errors,request}=await session(t);
 await page.locator('#files').setInputFiles(files('front','back','other'));
 await page.locator('#people input').last().uncheck();
 await page.locator('#combine').click();
 await page.locator('#all').click();
 await page.locator('#extract').click();
 (await request(0))(front);
 const second=await request(1);
 const job=page.getByRole('group',{name:'Same job?'});
 const address=page.getByRole('group',{name:'Same address?'});
 assert.equal(await job.count(),0);
 assert.equal(await page.locator('.row-jobs').count(),1);
 await page.locator('.row-phones').getByRole('button',{name:'Remove'}).click();
 const email=page.locator('.row-emails input').last();
 await email.fill('edited@example.invalid');
 await email.evaluate(input=>input.setSelectionRange(3,7));
 second(back);
 const third=await request(2);
 await job.waitFor();
 assert.equal(await address.isVisible(),true);
 assert.match(await page.locator('#status').textContent(),/Extracting 3 of 3/);
 assert.match(await page.locator('#people .active button').textContent(),/2 card/);
 assert.deepEqual(await email.evaluate(input=>[input.value,document.activeElement===input,input.selectionStart,input.selectionEnd]),['edited@example.invalid',true,3,7]);
 await email.press('Tab');
 assert.equal(await page.locator('.row-phones').count(),0);
 assert.equal(await page.locator('.row-websites').count(),0);
 assert.equal(await page.locator('.row-wechats').count(),1);
 assert.equal(await page.locator('#images .suggestion').count(),1);
 assert.equal(await page.locator('#editor .suggestion').count(),3);
 assert.equal(await page.getByText('Check the website.').isVisible(),true);
 await page.getByText('https://unclear.example.invalid',{exact:true}).locator('..').getByRole('button',{name:'Accept value'}).click();
 assert.equal(await page.locator('.row-websites input').last().inputValue(),'https://unclear.example.invalid');
 for(const button of await page.getByRole('button',{name:'Dismiss',exact:true}).all().then(items=>items.reverse()))await button.click();
 await page.getByRole('button',{name:'Acknowledge'}).click();
 const jobs=page.locator('.framed').filter({has:page.getByRole('heading',{name:'Jobs',exact:true})});
 await jobs.locator('.item').last().getByLabel('Job status').selectOption('former');
 assert.equal(await job.getByRole('button',{name:'Yes, link versions'}).isDisabled(),true);
 assert.equal(await job.getByText('Job statuses differ').isVisible(),true);
 await job.getByRole('button',{name:'Keep separate'}).click();
 assert.equal(await job.count(),0);
 await jobs.getByRole('button',{name:'Link with…'}).first().click();
 await jobs.getByLabel('Status for Job 2').selectOption('current');
 await jobs.getByRole('button',{name:/Link with Job 2/}).click();
 await address.getByRole('button',{name:'Yes, link versions'}).click();
 await jobs.getByRole('button',{name:'Unlink',exact:true}).click();
 assert.equal(await job.count(),0);
 third({names:['Fictional Other']});
 await statusContains(page,'3 completed');
 assert.match(await page.locator('#people .active button').textContent(),/2 card/);
 await page.locator('#people .person button').last().click();
 assert.match(await page.locator('#people .active button').textContent(),/Fictional Other/);
 await page.locator('#people .person button').first().click();
 assert.equal(await job.count(),0);
 assert.equal(await address.count(),0);
 assert.deepEqual(errors,[]);
});

test('cancelled and failed reads leave a combined source eligible for its first success',{timeout:45000},async t=>{
 const {page,errors,request}=await session(t);
 await page.locator('#files').setInputFiles(files('front','back'));
 await page.locator('#combine').click();
 await page.locator('#extract').click();
 (await request(0))(front);
 const cancelled=await request(1);
 await page.locator('#cancel').click();
 await statusContains(page,'Stopped. 1 completed');
 cancelled(back);
 assert.equal(await page.locator('.row-jobs').count(),1);
 await page.locator('#extract').click();
 (await request(2))(front);
 (await request(3))({},503);
 await statusContains(page,'1 failed');
 assert.equal(await page.getByRole('group',{name:'Same job?'}).count(),0);
 await page.locator('#retry').click();
 (await request(4))({...back,fieldWarnings:[],warnings:[]});
 await statusContains(page,'1 completed; 0 failed');
 const prompt=page.getByRole('group',{name:'Same job?'});
 assert.equal(await prompt.count(),1);
 await page.locator('#undo').click();
 assert.equal(await prompt.count(),0);
 assert.equal(await page.locator('.row-jobs').count(),1);
 await page.locator('#redo').click();
 assert.equal(await prompt.count(),1);
 assert.equal(await page.locator('.row-jobs').count(),2);
 assert.deepEqual(errors,[]);
});
