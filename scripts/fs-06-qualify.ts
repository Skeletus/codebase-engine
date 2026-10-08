import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';

// Developer-owned fixture qualification only. Normal analysis never invokes
// this runner or imports the synthetic Django oracle environments.
const tuple=process.argv.find(arg=>arg.startsWith('--tuple='))?.slice(8);
const profile=process.argv.find(arg=>arg.startsWith('--profile='))?.slice(10);
assert(tuple==='django52'||tuple==='django60'||tuple==='all','Explicit supported tuple required');
assert.equal(profile,'static-python-declared-environment','Explicit supported profile required');
assert(process.argv.slice(2).every(arg=>arg===`--tuple=${tuple}`||arg===`--profile=${profile}`),'Unknown qualification option');
type Oracle={tuple:string;status:string;profile:string;generatorHash:string;outputHash:string;result:{python:string;django:string;drf:string;routers:unknown[];converters:unknown[];decorators:unknown[];suffixes:unknown[];includes:unknown[]}};
const oracles=JSON.parse(readFileSync('docs/fs-06/evidence/framework-oracles.json','utf8')) as Oracle[];
const targets=tuple==='all'?['django52','django60']:[tuple];
const expected={django52:['3.12.15','5.2.18','3.16.1'],django60:['3.13.16','6.0.9','3.17.2']} as const;
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const testHash=hash(readFileSync('tests/framework-support/fs-06.test.ts'));
const results=[];
for(const target of targets){
  const oracle=oracles.filter(row=>row.tuple===target);assert.equal(oracle.length,1,'Missing or duplicate oracle');
  const row=oracle[0];assert.equal(row.status,'PASS');assert.equal(row.profile,profile);
  assert.equal(row.generatorHash,hash(readFileSync('scripts/fs-06-oracles.ts')),'Stale oracle generator');
  const raw=readFileSync(`docs/fs-06/evidence/oracle-output-${target}.json`);assert.equal(row.outputHash,hash(raw),'Corrupt oracle output');assert.deepEqual(JSON.parse(raw.toString()),row.result,'Oracle record/output mismatch');
  assert.deepEqual([row.result.python,row.result.django,row.result.drf],expected[target as keyof typeof expected]);
  for(const [name,count]of [['routers',8],['converters',20],['decorators',8],['suffixes',16],['includes',6]] as const)assert.equal(row.result[name].length,count,`Incomplete ${name} oracle`);
  const output=execFileSync(process.execPath,['--test','--test-name-pattern',`^FS06 qualification ${target} `,'tests/framework-support/fs-06.test.ts'],{encoding:'utf8',timeout:300000});
  assert(/tests 9\b/.test(output)&&/pass 9\b/.test(output)&&/fail 0\b/.test(output),'Missing or failing qualification groups');
  writeFileSync(`docs/fs-06/evidence/qualification-${target}.log`,output);
  const records=readdirSync('docs/fs-06/evidence/qualification').filter(name=>name.startsWith(target+'-')).sort().filter(name=>{const record=JSON.parse(readFileSync('docs/fs-06/evidence/qualification/'+name,'utf8')) as {testHash?:string;status:string};return record.testHash===testHash&&record.status==='PASS';}).map(name=>({file:name,hash:hash(readFileSync('docs/fs-06/evidence/qualification/'+name))}));
  assert.equal(records.length,79,'Incomplete current fixture inventory; historical records cannot substitute');
  results.push({target,profile,status:'PASS',testHash,oracleHash:hash(JSON.stringify(row)),outputHash:hash(output),records});
}
writeFileSync('docs/fs-06/evidence/qualification-run.json',JSON.stringify({status:'PASS',scope:'controlled qualification groups only; does not grant whole-phase acceptance',results},null,2)+'\n');
process.stdout.write(JSON.stringify({status:'PASS',targets,profile})+'\n');
