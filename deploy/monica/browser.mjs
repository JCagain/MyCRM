import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '../../card2vcf/node_modules/@playwright/test/index.mjs';

const url=process.env.MONICA_FICTIONAL_URL || 'http://127.0.0.1:8081';
if(!['http://127.0.0.1:8081','http://127.0.0.1:8082'].includes(url))throw new Error('Only isolated fictional loopback ports are supported.');
for(let attempt=0;attempt<30;attempt++) {
 try { if((await fetch(url+'/login')).ok)break; } catch {}
 if(attempt===29)throw new Error('Fictional Monica did not become ready.');
 await new Promise(resolve=>setTimeout(resolve,1000));
}
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
 await page.goto(url+'/login');
 await page.locator('#email').fill('monica-browser@example.invalid');
 await page.locator('#password').fill('fictional-browser-only');
 await Promise.all([page.waitForURL('**/dashboard'),page.locator('button[type=submit]').click()]);
 await page.goto(url+'/people');
 const profile=await page.getByRole('link',{name:'Fictional Person',exact:true}).getAttribute('href');
 assert.ok(profile,'fictional person appears in the existing list');
 await page.goto(profile+'/work/edit');
 assert.equal(await page.getByRole('heading',{name:'Jobs and printed language variants'}).count(),1);
 const jobs=page.locator('fieldset').filter({has:page.getByText('Select job',{exact:true})});
 const before=await jobs.count();assert.equal(before,5);
 await jobs.first().getByRole('button',{name:'Unlink language variants'}).click();
 assert.equal(await jobs.count(),before+1);
 await jobs.nth(0).getByLabel('Select job',{exact:true}).check();
 await jobs.filter({has:page.locator('input[value="示例"]')}).getByLabel('Select job',{exact:true}).check();
 await page.getByRole('button',{name:'Link selected jobs as language variants'}).click();
 assert.equal(await jobs.count(),before);
 await page.goto(profile);
 assert.equal(await page.getByRole('heading',{name:'Contact methods and language links'}).count(),1);
 const wechat=page.locator('form').filter({has:page.locator('input[name=service][value=wechat]')}).last();
 await wechat.locator('input[name=data]').fill('browser-fictional-wechat');await wechat.getByRole('button',{name:'Save',exact:true}).click();
 assert.equal(await page.locator('input[value=browser-fictional-wechat]').count(),1);
 await page.goto(url+'/settings/organization');
 const category=page.locator('form').filter({has:page.locator('input[name=kind][value=category]')}).last();
 await category.getByLabel('New category').fill('Browser category');await category.getByRole('button',{name:'Add',exact:true}).click();
 const tag=page.locator('form').filter({has:page.locator('input[name=kind][value=tag]')}).last();
 await tag.getByLabel('New tag').fill('Browser tag');await tag.getByLabel(/^Category/).selectOption({label:'Browser category'});await tag.getByRole('button',{name:'Add',exact:true}).click();
 await tag.getByLabel('New tag').fill('Browser extra tag');await tag.getByLabel(/^Category/).selectOption({label:'Browser category'});await tag.getByRole('button',{name:'Add',exact:true}).click();
 await page.goto(url+'/people');
 const batch=page.getByRole('form',{name:'Batch edit people'});
 const addTags = batch.locator('details').filter({has: page.locator('summary').filter({hasText: /^Add tags/})});
 const removeTags = batch.locator('details').filter({has: page.locator('summary').filter({hasText: /^Remove tags/})});
 await batch.getByRole('checkbox',{name:'Select Fictional Person',exact:true}).check();
 await addTags.locator('summary').click();
 await addTags.getByLabel('Browser tag', {exact: true}).check();
 await addTags.getByLabel('Browser extra tag', {exact: true}).check();
 await addTags.locator('summary').click();
 await batch.getByLabel(/^Closeness/).selectOption({label:'Close'});
 await batch.getByRole('button',{name:'Apply to selected people'}).click();
 const filters=page.getByRole('form',{name:'People filters'});
 const extraTag = filters.getByLabel('Browser extra tag', {exact: true});
 await extraTag.check();
 await filters.getByRole('button',{name:'Apply filters'}).click();
 await page.getByRole('link',{name:'Fictional Person',exact:true}).waitFor();
 await batch.getByRole('checkbox',{name:'Select Fictional Person',exact:true}).check();
 await removeTags.locator('summary').click();
 await removeTags.getByLabel('Browser extra tag', {exact: true}).check();
 await removeTags.locator('summary').click();
 await batch.getByRole('button',{name:'Apply to selected people'}).click();
 await page.getByText('No people match these filters.').waitFor();
 await page.goto(url+'/people');
 await filters.getByLabel('Browser tag',{exact:true}).check();await filters.getByLabel(/^Closeness/).selectOption({label:'Close'});
 await filters.getByRole('button',{name:'Apply filters'}).click();
 assert.equal(await page.getByRole('link',{name:'Fictional Person',exact:true}).count(),1);
 assert.equal(await page.getByRole('checkbox',{name:'Select Fictional Person',exact:true}).isChecked(),false);
 await mkdir(new URL('../../.monica-tools/screenshots/',import.meta.url),{recursive:true});
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`people list fits ${width}px`);
  const addTagsBox = await addTags.locator('summary').boundingBox();
  const removeTagsBox = await removeTags.locator('summary').boundingBox();
  assert.equal(addTagsBox.width, removeTagsBox.width);
  assert.ok(addTagsBox.x + addTagsBox.width < removeTagsBox.x);
  const companyBox = await filters.getByLabel('Company', {exact: true}).boundingBox();
  const formerBox = await filters.getByLabel('Include former memberships').boundingBox();
  assert.ok(companyBox.x + companyBox.width < formerBox.x && Math.abs(companyBox.y - formerBox.y) < companyBox.height);
  await page.screenshot({path:new URL(`../../.monica-tools/screenshots/people-${width}.png`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
 }
 await page.goto(url + '/people?search=Fictional%20Bulk%20Delete');
 const alpha = batch.getByRole('checkbox', {name: 'Select Fictional Bulk Delete Alpha', exact: true});
 const beta = batch.getByRole('checkbox', {name: 'Select Fictional Bulk Delete Beta', exact: true});
 const deleteSelected = batch.getByRole('button', {name: 'Delete selected contacts'});
 await alpha.check();
 await beta.check();
 await deleteSelected.click();
 await page.getByRole('heading', {name: 'Delete 2 contacts?'}).waitFor();
 await page.getByRole('link', {name: 'Cancel'}).click();
 assert.equal(new URL(page.url()).searchParams.get('search'), 'Fictional Bulk Delete');
 await alpha.check();
 await beta.check();
 await deleteSelected.click();
 await page.getByRole('button', {name: 'Delete selected contacts'}).click();
 await page.getByText('2 contacts deleted.').waitFor();
 assert.equal(await alpha.count(), 0);
 assert.equal(await beta.count(), 0);
 await page.getByRole('link', {name: 'Fictional Bulk Delete Gamma'}).waitFor();

 await page.goto(profile+'/work/edit');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'work editor fits narrow layout');
 await page.goto(url+'/settings/organization');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'settings fit narrow layout');

 await page.goto(url+'/settings/import/upload');
 assert.match(await page.locator('#fileHelp').innerText(), /256 MiB/);
 const photo = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d');
  const image = context.createImageData(canvas.width, canvas.height);
  const pixels = new Uint32Array(image.data.buffer);
  let sample = 123456789;
  for (let index = 0; index < pixels.length; index++) {
   sample ^= sample << 13;
   sample ^= sample >>> 17;
   sample ^= sample << 5;
   pixels[index] = sample | 0xff000000;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
 });
 const photoLines = ('PHOTO:' + photo).match(/.{1,75}/g).join('\r\n ');
 const batchId = Date.now();
 const cards = ['Alpha', 'Beta', 'Gamma'].map(name => [
  'BEGIN:VCARD', 'VERSION:4.0', `FN:Fictional ${name} ${batchId}`, `N:${name} ${batchId};Fictional;;;`,
  photoLines, 'END:VCARD', '',
 ].join('\r\n')).join('');
 const buffer = Buffer.from(cards);
 assert.ok(buffer.length > 10 * 1024 * 1024, 'fixture exceeds the old vCard upload cap');
 const filename = `Fictional photos & cards ${batchId}.vcf`;
 await page.locator('#vcard').setInputFiles({name: filename, mimeType: 'text/vcard', buffer});
 await Promise.all([page.waitForURL('**/settings/import'), page.locator('#upload').click()]);
 const importRow = page.locator('.table-row').filter({hasText: filename});
 await importRow.getByText('3 imported', {exact: false}).waitFor();
 await importRow.getByRole('link', {name: 'View report'}).click();
 await page.getByText(filename, {exact: true}).waitFor();

 assert.deepEqual(errors,[]);
 process.stdout.write('Monica fictional browser flow passed, including a vCard upload over 10 MiB and its filename in import history and the report.\n');
} catch(error) {
 process.stderr.write(`Browser failed at ${page.url()}\n${(await page.locator('body').innerText()).slice(0,1800)}\n`);throw error;
} finally { await browser.close(); }
