// Fictional handoff output only; never loads files or calls a model.
import {contractFixture} from '../fixtures/integration-contract.mjs';
import {vcard} from '../../public/vcard.mjs';
const mode=process.argv[2]??'structured';
if(!['structured','monica'].includes(mode))throw Error('Use structured or monica.');
process.stdout.write(vcard(contractFixture(),mode));
