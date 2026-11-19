import test from 'node:test';
import http from 'node:http';
import {chromium,expect} from '@playwright/test';
import {createApp} from '../../server.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));

async function checkToolbarLayout(page,{add,check,setup,close,selection}){
 const toolbar=page.locator('.card-toolbar'),header=page.locator('header'),model=header.locator('.model-connection');
 const checkButton=model.getByRole('button',{name:check}),help=model.getByRole('button',{name:setup});
 const setupDialog=page.getByRole('dialog',{name:setup});
 await expect(toolbar.locator('.button')).toHaveText(add);
 await expect(header.locator('#modelStatus')).toBeVisible();
 await expect(help).toHaveText('?');
 await expect(page.getByText(/Local · session only|本地运行 · 仅限当前会话/)).toHaveCount(0);
 expect(await page.locator('.selection-actions button').allTextContents()).toEqual(selection);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const [titleBox,checkBox,helpBox,headerBox,toolbarBox]=await Promise.all([
   model.locator('strong').boundingBox(),checkButton.boundingBox(),help.boundingBox(),header.boundingBox(),toolbar.boundingBox()
  ]);
  expect(checkBox.x-titleBox.x-titleBox.width).toBeCloseTo(6,0);
  expect(helpBox.x-checkBox.x-checkBox.width).toBeCloseTo(6,0);
  expect(toolbarBox.y).toBeGreaterThanOrEqual(headerBox.y+headerBox.height);
  const alignment=await page.locator('aside>.actions').evaluateAll(rows=>rows.map(row=>getComputedStyle(row).justifyContent));
  expect(alignment).toEqual(['center','center','center','center']);
  const colors=await page.locator('.selection-actions button,#batch').evaluateAll(buttons=>buttons.map(button=>getComputedStyle(button).backgroundColor));
  expect(new Set(colors.slice(0,3)).size).toBe(1);
  expect(colors[0]).not.toBe(colors[3]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await help.click();
 await expect(setupDialog).toBeVisible();
 await expect(setupDialog.locator('pre').first()).toContainText('llama serve');
 await expect(setupDialog.getByRole('button',{name:close})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(setupDialog).toBeHidden();
 await expect(help).toBeFocused();
 await help.click();
 await setupDialog.getByRole('button',{name:close}).click();
 await expect(setupDialog).toBeHidden();
}

test('switch UI languages in a working session without navigating or changing contact data',{timeout:30000},async t=>{
 const model=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/v1/models')return res.end(JSON.stringify({data:[{id:'fictional'}]}));
  res.statusCode=503;res.end('{}');
 });
 const endpoint=await listen(model);
 const app=createApp({endpoint:endpoint+'/v1',model:'fictional',key:''});
 t.after(()=>{app.closeAllConnections();app.close();model.closeAllConnections();model.close();});
 const url=await listen(app);
 const browser=await chromium.launch({channel:'msedge',headless:true});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:390,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await expect(page.locator('#status')).toContainText('Ready');
 let navigations=0;
 page.on('framenavigated',()=>navigations++);
 const language=page.locator('#uiLanguage');
 await page.locator('#checkModel').click();
 await expect(page.locator('#modelStatus')).toContainText('Model reachable · fictional');
 await checkToolbarLayout(page,{add:'Add cards',check:'Check model',setup:'Start the local model server (PowerShell)',close:'Close',selection:['Select all','Clear','Invert selection']});
 await page.locator('#files').setInputFiles({name:'Export.png',mimeType:'image/png',buffer:png});
 await page.locator('#extract').click();
 await expect(page.locator('#images .warning')).toContainText('HTTP 503');
 await page.getByLabel('Main name (printed names, separated by spaces)').fill('Export');
 await language.selectOption('zh-CN');
 await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
 await expect(page.getByRole('combobox',{name:'界面语言'})).toBeVisible();
 await expect(page.locator('#modelStatus')).toContainText('模型可连接 · fictional');
 await expect(page.locator('#status')).toContainText('失败 1 项');
 await expect(page.locator('#images .warning')).toContainText('模型服务返回 HTTP 503');
 await expect(page.locator('#selectionCount')).toHaveText('已选择 1 位联系人');
 await checkToolbarLayout(page,{add:'添加名片',check:'检查模型',setup:'启动本地模型服务（PowerShell）',close:'关闭',selection:['全选','清除选择','反选']});
 await expect(page.getByLabel('主姓名（用空格分隔名片上的多个姓名）')).toHaveValue('Export');
 await page.getByRole('button',{name:'旋转',exact:true}).click();
 await page.locator('#reviewSelected').click();
 await expect(page.locator('#status')).toContainText('已核对');
 await page.locator('#batch').click();
 await expect(page.locator('#batchDialog').getByLabel('场合')).toBeVisible();
 await page.locator('#batchDialog [data-close]').click();
 await page.locator('#export').click();
 await expect(page.locator('#mode')).toHaveValue('structured');
 await expect(page.locator('#modeHelp')).toContainText('适用于修改版 Monica');
 await page.locator('#mode').selectOption('monica');
 await expect(page.locator('#modeHelp')).toContainText('适用于标准版 Monica');
 await page.locator('#mode').selectOption('structured');
 const preview=await page.locator('#preview').textContent();
 expect(preview).toContain('FN:Export');
 await expect(page.locator('#exportNotice')).toContainText('已准备好 1 位');
 await page.locator('#exportDialog [data-close]').click();
 await language.selectOption('en');
 await expect(page.locator('#status')).toContainText('1 person marked reviewed');
 await expect(page.locator('#images img')).toHaveAttribute('style',/rotate\(90deg\)/);
 await expect(page.locator('#selectionCount')).toHaveText('1 person selected');
 await page.locator('#export').click();
 await expect(page.locator('#preview')).toHaveText(preview);
 expect(navigations).toBe(0);
 expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
 expect(errors).toEqual([]);
});
