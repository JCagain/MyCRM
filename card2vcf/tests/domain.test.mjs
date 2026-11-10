import test from 'node:test';import assert from 'node:assert/strict';import ICAL from 'ical.js';import * as OpenCC from 'opencc-js';import {History,person,combine,detach,applyExtraction,batch,displayName,signature} from '../public/domain.mjs';import {vcard,fold} from '../public/vcard.mjs';import {validateResult} from '../src/schema.mjs';
const convert=OpenCC.Converter({from:'t',to:'cn'});
test('original photos roundtrip as URI values with byte-safe folding in both modes',()=>{
 const p=person('a');p.display='Fictional Contact';
 const photos=['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','data:image/jpeg;base64,/9j/AA==','data:image/webp;base64,UklGRgAAAAAXRUJQ'];
 for(const mode of ['monica','structured']){
  const text=vcard(p,mode,photos),parsed=new ICAL.Component(ICAL.parse(text));
  assert.deepEqual(parsed.getAllProperties('photo').map(prop=>prop.getFirstValue()),photos);
  assert.equal(parsed.getAllProperties('photo')[0].getParameter('mediatype'),'image/png');
  for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 }
 assert.throws(()=>vcard(p,'monica',['data:text/html;base64,AAAA']));
 assert.throws(()=>vcard(p,'monica',['data:image/png;base64,AAAA\r\nEMAIL:injected']));
 const payload='PHOTO:data:image/png;base64,'+'A'.repeat(1024*1024),folded=fold(payload);
 assert.equal(folded.replace(/\r\n /g,''),payload);
 assert.equal(new ICAL.Component(ICAL.parse(vcard(p))).getAllProperties('photo').length,0,'text preview can omit photos');
});
const data=()=>validateResult({names:['陳大文','David Chan'],jobs:[{company:'Example',title:'Advisor'}],phones:[{label:'work',value:'+1 202 555 0100'}]});
test('Unicode names, aliases and safe vCard parsing',()=>{const p=person('card');applyExtraction(p,'card',data(),convert);assert.equal(displayName(p),'陳大文 David Chan');assert.ok(p.names.some(n=>n.value==='陈大文'&&n.origin==='generated'));p.notes='Line\nEMAIL:injected@example.invalid; , \\';const text=vcard(p);const parsed=new ICAL.Component(ICAL.parse(text));assert.equal(parsed.getFirstPropertyValue('fn'),'陳大文 David Chan');assert.equal(parsed.getFirstPropertyValue('nickname'),'陈大文');assert.equal(parsed.getAllProperties('email').length,0);assert.equal(parsed.getFirstPropertyValue('note'),p.notes);for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);assert.ok(fold('NOTE:'+ '陳'.repeat(100)).includes('\r\n '));});
test('combine, detach and undo retain conflicting values and images',()=>{const h=new History();h.state=[person('a'),person('b')];applyExtraction(h.state[0],'a',data(),convert);applyExtraction(h.state[1],'b',validateResult({names:['Other']}),convert);const before=structuredClone(h.state);h.change(()=>h.state=combine(h.state,h.state.map(p=>p.id)));assert.equal(h.state.length,1);assert.equal(h.state[0].cards.length,2);h.undo();assert.deepEqual(h.state,before);h.redo();h.change(s=>detach(s,s[0].id,['b']));assert.equal(h.state[1].names[0].value,'Other');h.undo();assert.equal(h.state.length,1);});
test('batch preserves approval and blanks; suppression survives extraction',()=>{const p=person('a');applyExtraction(p,'a',data(),convert);p.reviewed=true;p.firstMet.occasion='Existing';batch([p],[p.id],{occasion:'New',date:'2026-01-01'},false);assert.equal(p.firstMet.occasion,'Existing');assert.equal(p.reviewed,true);const sig=signature(p);p.reviewed=false;assert.equal(signature(p),sig);p.names=p.names.filter(n=>n.origin!=='generated');p.suppressed=['陈大文'];applyExtraction(p,'a',data(),convert);assert.ok(!p.names.some(n=>n.value==='陈大文'));});
test('model schema rejects malformed types',()=>{assert.throws(()=>validateResult({names:[123]}));assert.throws(()=>validateResult({jobs:'bad'}));assert.throws(()=>validateResult(null));});

test('re-export UID, structured jobs, URI values and ZIP preservation',async()=>{const {zipSync,unzipSync,strToU8,strFromU8}=await import('fflate');const p=person('card');applyExtraction(p,'card',data(),convert);p.jobs.push({company:'Second; Unit',title:'Researcher'});p.websites.push({label:'work',value:'https://example.invalid/a,b?x=1;2'});p.addresses.push({label:'work',street:'One; Two',city:'Fictional',country:'China'});const text=vcard(p);assert.equal(new ICAL.Component(ICAL.parse(text)).getFirstPropertyValue('uid'),p.uid);assert.ok(text.includes('Other job'));assert.ok(text.includes('URL:https://example.invalid/a,b?x=1;2'));const structured=vcard(p,'structured');assert.ok(structured.includes('job2.ORG:Second\\; Unit'));const archive=zipSync({'contact.vcf':strToU8(text)});assert.equal(strFromU8(unzipSync(archive)['contact.vcf']),text);});
