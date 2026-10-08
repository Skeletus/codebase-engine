import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {djangoRules} from '../lib/engine/adapters/django-rules.ts';

const tuple=process.argv.find(a=>a.startsWith('--tuple='))?.slice(8);
const profile=process.argv.find(a=>a.startsWith('--profile='))?.slice(10);
assert.equal(tuple,'all','Metadata generation requires both mandatory exact tuples');
assert.equal(profile,'static-python-declared-environment','Explicit supported profile required');
const bytes=readFileSync('docs/fs-06/evidence/framework-oracles.json');
type OracleRecord={tuple:string;status:string;profile:string;result:{python:string;django:string;drf:string;framework:{name:string;mro:string[];httpMethods:string[]}[]}};
const records=JSON.parse(bytes.toString()) as OracleRecord[];
const expected={django52:['3.12.15','5.2.18','3.16.1'],django60:['3.13.16','6.0.9','3.17.2']};
const generated:Record<string,(typeof djangoRules)[string]>={};
for(const [id,versions]of Object.entries(expected)){
  const selected=records.filter(r=>r.tuple===id);assert.equal(selected.length,1);
  const record=selected[0];assert.equal(record.status,'PASS');assert.equal(record.profile,profile);
  assert.deepEqual([record.result.python,record.result.django,record.result.drf],versions);
  assert.equal(record.result.framework.length,19);
  assert.equal(djangoRules[id].length,19);
  generated[id]=record.result.framework.map(input=>{
    // Public re-export spellings are the fixed reviewed aliases; semantic
    // MRO/method data is regenerated exclusively from the pinned oracle.
    const aliases=djangoRules[id].filter(rule=>rule.names.includes(input.name));assert.equal(aliases.length,1);
    return {names:[...aliases[0].names],mro:input.mro,methods:input.httpMethods};
  });
}
assert.deepEqual(generated,djangoRules,'Retained metadata must match both exact upstream oracle outputs');
const source='// Pinned trusted-framework metadata from controlled FS-06 oracles, never customer runtime introspection.\nexport const djangoRules: Readonly<Record<string, readonly {names: readonly string[]; mro: readonly string[]; methods: readonly string[]}[]>> = '+JSON.stringify(generated,null,2)+';\n';
if(process.argv.includes('--generate'))writeFileSync('lib/engine/adapters/django-rules.ts',source);
else assert.equal(readFileSync('lib/engine/adapters/django-rules.ts','utf8').replaceAll('\r\n','\n'),source,'Generated metadata source must be reproducible');
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
writeFileSync('docs/fs-06/evidence/rule-metadata.json',JSON.stringify({status:'PASS',tuples:Object.keys(expected),profile,classesPerTuple:19,oracleHash:hash(bytes),outputHash:hash(source),harnessHash:hash(readFileSync(import.meta.filename)),scope:'Deterministic MRO/method metadata only. Reviewed public alias spellings are retained. This does not grant full framework qualification.'},null,2)+'\n');
console.log('PASS exact tuples/profile and reproducible 19-class metadata');
