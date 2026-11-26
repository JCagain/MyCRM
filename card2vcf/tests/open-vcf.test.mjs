import assert from 'node:assert/strict';
import test from 'node:test';
import {groups,socialValue} from '../public/contact-metadata.mjs';
import {readVcf} from '../public/open-vcf.mjs';
import {vcard} from '../public/vcard.mjs';
import {contractFixture} from './fixtures/integration-contract.mjs';

const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';

test('opens structured exports with editable jobs, variants, contact methods and original photo bytes',async()=>{
 const original=contractFixture();
 original.display='Fictional Person';
 original.jobs[0].company='Fictional; Example, Inc.';
 original.jobs[0].title='Advisor; coordinator';
 original.names.push({value:'Alternate Fictional Name',origin:'manual'});
 const [{person,photos,skippedPhotos}]=readVcf(vcard(original,'structured',[photo,photo]));
 assert.equal(person.display,'Fictional Person');
 assert.deepEqual(person.names.map(row=>row.value),['Fictional Person','Alternate Fictional Name']);
 assert.deepEqual(groups(person.jobs).map(job=>job.map(({company,title,status})=>[company,title,status])),
  groups(original.jobs).map(job=>job.map(({company,title,status})=>[company,title,status])));
 assert.deepEqual(groups(person.addresses).map(address=>address.map(row=>row.street)),
  groups(original.addresses).map(address=>address.map(row=>row.street)));
 assert.equal(person.socials[1].phoneId,person.phones[0].id);
 assert.equal(person.socials[3].phoneId,null);
 person.phones[0].value='555-0111';
 assert.equal(socialValue(person,person.socials[1]),'555-0111');
 assert.equal(socialValue(person,person.socials[3]),'555-0100');
 assert.equal(person.wechats[0].value,'fictional_wechat');
 assert.equal(person.emails[0].value,'fictional@example.invalid');
 assert.equal(person.websites[0].value,'https://example.invalid/fictional');
 assert.equal(person.nicknames,original.nicknames);
 assert.ok(person.notes.startsWith(original.notes+'\n'));
 assert.deepEqual(person.firstMet,original.firstMet);
 assert.doesNotMatch(person.notes,/First met location: Example hall/);
 assert.equal(person.reviewed,false);
 assert.notEqual(person.uid,original.uid);
 assert.equal(skippedPhotos,0);
 assert.equal(photos.length,2);
 for(const file of photos){
  assert.equal(file.type,'image/png');
  assert.equal(Buffer.from(await file.arrayBuffer()).toString('base64'),photo.split(',')[1]);
 }
});

test('opens compatible exports beside ordinary vCards and retains fallbacks as notes',()=>{
 const original=contractFixture(),compatible=vcard(original,'monica');
 const external=[
  'BEGIN:VCARD','VERSION:3.0','N:Example;Fictional;;;Jr.',
  'TEL;TYPE=WORK,VOICE:555-0123','EMAIL;TYPE=HOME:example@example.invalid',
  'NOTE:First line\\nSecond line, with a comma',
  '  and folding','PHOTO;TYPE=PNG;ENCODING=b:'+photo.split(',')[1],
  'PHOTO;VALUE=uri:https://example.invalid/remote.png','END:VCARD'
 ].join('\n');
 const [{person:other,photos,skippedPhotos},{person}]=readVcf('\ufeff'+external+'\n\n'+compatible);
 assert.equal(other.display,'Fictional Example Jr.');
 assert.equal(other.phones[0].value,'555-0123');
 assert.equal(other.phones[0].label,'WORK / VOICE');
 assert.equal(other.notes,'First line\nSecond line, with a comma and folding');
 assert.equal(photos[0].type,'image/png');
 assert.equal(skippedPhotos,1);
 assert.equal(person.jobs.length,1);
 assert.equal(person.jobs[0].status,'unspecified');
 assert.deepEqual(person.firstMet,original.firstMet);
 assert.match(person.notes,/Other job: Former Example — Researcher/);
 const [{person:reopened}]=readVcf(vcard(person,'monica'));
 assert.equal(reopened.notes.split('\n').filter(note=>note==='WeChat: fictional_wechat').length,1);
});

test('restores First met from older exports and preserves multiline values and ordinary notes',()=>{
 const original=contractFixture();
 original.firstMet.occasion='Conference, day one';
 original.firstMet.notes='Introduced by a colleague\nFollow-up with a backslash: \\';
 const exported=vcard(original,'monica');
 const legacy=exported.replace(/^X-C2V-FIRST-MET-.*\r\n(?:[ \t].*\r\n)*/gm,'');
 for(const source of [exported,legacy]){
  const [{person}]=readVcf(source);
  assert.deepEqual(person.firstMet,original.firstMet);
  assert.ok(person.notes.startsWith(original.notes+'\n'));
  assert.doesNotMatch(person.notes,/First met /);
 }
 const [{person}]=readVcf('BEGIN:VCARD\nVERSION:4.0\nFN:External\nNOTE:First met location: ordinary note\nEND:VCARD');
 assert.equal(person.firstMet.location,'');
 assert.equal(person.notes,'First met location: ordinary note');
});

test('rejects malformed files and unsupported versions before returning any contacts',()=>{
 const good='BEGIN:VCARD\nVERSION:4.0\nFN:Fictional Example\nEND:VCARD';
 for(const input of ['', 'other file', 'garbage\n'+good, good+'\nBEGIN:VCARD\nFN:Truncated',good.replace('END:VCARD','END:VCALENDAR')]){
  assert.throws(()=>readVcf(input),/valid vCard/);
 }
 assert.throws(()=>readVcf(good.replace('4.0','2.1')),/supports vCard 3.0 and 4.0/);
});
