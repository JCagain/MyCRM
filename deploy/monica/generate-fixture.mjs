import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {contractFixture} from '../../card2vcf/tests/fixtures/integration-contract.mjs';
import {vcard} from '../../card2vcf/public/vcard.mjs';

const directory=new URL('../../.monica-tools/',import.meta.url);
await mkdir(directory,{recursive:true});
await mkdir(new URL('handoff/',directory),{recursive:true});
await writeFile(new URL('fictional.vcf',directory),vcard(contractFixture(),'structured'));
process.stdout.write(`Generated fictional converter fixture in ${fileURLToPath(directory)}\n`);
