import {person,applyExtraction} from '../../public/domain.mjs';
import {validateResult} from '../../src/schema.mjs';
import {link,associate,setStatus} from '../../public/contact-metadata.mjs';
import assert from 'node:assert/strict';
export function fixture(){const p=person('front');applyExtraction(p,'front',validateResult({names:['Fictional Person'],jobs:[{company:'Example',title:'Advisor'},{company:'\u793a\u4f8b',title:'\u987e\u95ee'},{company:'Former Example',title:'Researcher'}],phones:[{label:'work',value:'555-0100'}],addresses:[{street:'1 Example Road'},{street:'\u793a\u4f8b\u8def1\u53f7'}],socials:[{label:'LinkedIn',value:'fictional-profile'},{label:'WhatsApp',value:'555-0100'},{label:'WhatsApp',value:'555-0199'}]}),x=>x);link(p,'jobs',p.jobs.slice(0,2).map(r=>r.id));link(p,'addresses',p.addresses.map(r=>r.id));setStatus(p,p.jobs[2].id,'former');associate(p,p.socials[1].id,p.phones[0].id);return p;}

export function contractFixture(){
 const p=fixture();
 setStatus(p,p.jobs[0].id,'unspecified');
 p.jobs.push({company:'Example',title:'Another role',status:'current'},{company:'Company only',title:'',status:'unspecified'},{company:'',title:'Title only',status:'former'});
 p.addresses.push({street:'Independent road',city:'Example City'});
 p.socials.push({label:'WhatsApp',value:'555-0100'});
 p.emails.push({label:'work',value:'fictional@example.invalid'});
 p.wechats.push({value:'fictional_wechat'});
 p.nicknames='Fictional nickname';
 p.websites.push({label:'Website',value:'https://example.invalid/fictional'});
 p.firstMet={date:'2020-01-02',occasion:'Fictional conference',location:'Example hall',notes:'Fictional introduction'};
 p.notes='Fictional escape check: comma, semicolon; slash\\\n'+ '\u793a\u4f8b'.repeat(60);
 return p;
}

// Shared semantic expectations for independent JavaScript and deployed PHP parsers.
export function assertContract(rows){
 const all=name=>rows.filter(r=>r.name===name),first=name=>all(name)[0];
 const orgs=all('org'),titles=all('title');
 assert.deepEqual(orgs.map(r=>r.parts[0]),['Example','\u793a\u4f8b','Former Example','Example','Company only']);
 assert.deepEqual(titles.map(r=>r.parts[0]),['Advisor','\u987e\u95ee','Researcher','Another role','Title only']);
 assert.deepEqual(orgs.map(r=>r.group),['job1','job1','job2','job3','job4']);
 assert.equal(orgs[0].params.altid,'job1-org');assert.equal(orgs[1].params.altid,'job1-org');
 assert.equal(titles[1].params.altid,'job1-title');assert.equal(orgs[1].params['x-c2v-pair'],'v2');
 assert.equal(titles[1].params['x-c2v-pair'],'v2');
 assert.ok(orgs.slice(2).every(r=>!r.params.altid));
 assert.equal(titles.at(-1).group,'job5');
 assert.deepEqual(all('x-c2v-job-status').map(r=>r.parts[0]),['unspecified','former','current','unspecified','former']);
 const addresses=all('adr');assert.equal(addresses.length,3);
 assert.equal(addresses[0].params.altid,'address1');assert.equal(addresses[1].params.altid,'address1');assert.ok(!addresses[2].params.altid);
 assert.equal(addresses[0].parts[2],'1 Example Road');
 const social=all('x-socialprofile');assert.equal(social.length,4);
 assert.deepEqual(social.map(r=>r.params.type.toLowerCase()),['linkedin','whatsapp','whatsapp','whatsapp']);
 assert.equal(first('tel').group,'phone1');assert.equal(social[1].params['x-c2v-phone'],'phone1');
 assert.equal(social[1].parts[0],first('tel').parts[0]);assert.equal(social[3].parts[0],first('tel').parts[0]);
 assert.ok(!social[2].params['x-c2v-phone']&&!social[3].params['x-c2v-phone']);
 assert.equal(first('email').parts[0],'fictional@example.invalid');assert.equal(first('x-wechat').parts[0],'fictional_wechat');
 assert.equal(first('nickname').parts[0],'Fictional nickname');assert.equal(first('url').parts[0],'https://example.invalid/fictional');
 assert.ok(first('note').parts[0].includes('First met occasion: Fictional conference'));
 assert.ok(first('note').parts[0].includes('comma, semicolon; slash\\\n'+ '\u793a\u4f8b'.repeat(60)));
}
