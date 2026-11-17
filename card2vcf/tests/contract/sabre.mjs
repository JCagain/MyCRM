// Only generated fictional fixtures enter this disposable parser process.
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {contractFixture as fixture,assertContract} from '../fixtures/integration-contract.mjs';
import {vcard} from '../../public/vcard.mjs';

const config=mkdtempSync(join(tmpdir(),'c2v-parser-'));
const image='monica:4.1.2@sha256:9319157715ef21ce4206b7efcc66a74ce4ae0eed8859905e69e1be6105e4ecef';
try {
 const code=readFileSync(new URL('./parse.php',import.meta.url),'utf8').replace(/^<\?php\s*/, '');
 const result=JSON.parse(execFileSync('docker',['--config',config,'run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--entrypoint','php',image,'-r',code],{input:vcard(fixture(),'structured'),encoding:'utf8',timeout:60000}));
 assert.equal(result.version,'4.5.4');
 assertContract(result.rows.map(r=>({name:r.name.toLowerCase(),group:r.group?.toLowerCase(),params:Object.fromEntries(Object.entries(r.params).map(([k,v])=>[k.toLowerCase(),v])),parts:r.parts})));
 console.log('Sabre/vobject 4.5.4: actual fictional exporter contract passed.');
} finally {rmSync(config,{recursive:true,force:true});}
