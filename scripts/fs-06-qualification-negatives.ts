import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const runner=path.resolve('scripts/fs-06-qualify.ts'),records=[];
const args=['--tuple=django52','--profile=static-python-declared-environment'];
for(const [name,options]of [['missing-options',[]],['missing-profile',['--tuple=django52']],['wrong-tuple',['--tuple=django99',args[1]]],['wrong-profile',[args[0],'--profile=runtime']],['unknown-option',[...args,'--skip-oracle']]] as const){const result=spawnSync(process.execPath,[runner,...options],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,1);records.push({name,status:'PASS',outcome:'qualification refused',diagnosticHash:createHash('sha256').update(result.stderr).digest('hex')});}
type Oracle={tuple:string;status:string;profile:string;generatorHash:string;outputHash:string;result:Record<string,unknown>};
const original=JSON.parse(readFileSync('docs/fs-06/evidence/framework-oracles.json','utf8')) as Oracle[];
const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 qualification negatives '));
try{
  mkdirSync(path.join(root,'docs/fs-06/evidence'),{recursive:true});mkdirSync(path.join(root,'scripts'));copyFileSync('scripts/fs-06-oracles.ts',path.join(root,'scripts/fs-06-oracles.ts'));
  for(const name of ['missing-oracle','duplicate-oracle','unavailable-oracle','wrong-version','incomplete-table','stale-generator','corrupt-output']){
    const rows=structuredClone(original);let selected=rows[0];assert.equal(selected.tuple,'django52');
    if(name==='missing-oracle')rows.shift();if(name==='duplicate-oracle')rows.push(structuredClone(selected));if(name==='unavailable-oracle')selected.status='UNVERIFIED';if(name==='wrong-version')selected.result.django='5.2.17';if(name==='incomplete-table')selected.result.converters=[];if(name==='stale-generator')selected.generatorHash='0'.repeat(64);
    for(const row of rows){const raw=JSON.stringify(row.result)+'\n';row.outputHash=createHash('sha256').update(raw).digest('hex');writeFileSync(path.join(root,`docs/fs-06/evidence/oracle-output-${row.tuple}.json`),raw);}
    selected=rows.find(row=>row.tuple==='django52')??selected;if(name==='corrupt-output')selected.outputHash='0'.repeat(64);
    writeFileSync(path.join(root,'docs/fs-06/evidence/framework-oracles.json'),JSON.stringify(rows));const result=spawnSync(process.execPath,[runner,...args],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,1,name);records.push({name,status:'PASS',outcome:'qualification refused before fixture execution',diagnosticHash:createHash('sha256').update(result.stderr).digest('hex')});
  }
}finally{assert(path.basename(root).startsWith('cartograph FS06 qualification negatives '));rmSync(root,{recursive:true,force:true});}
writeFileSync('docs/fs-06/evidence/qualification-negatives.json',JSON.stringify({status:'PASS',records},null,2)+'\n');console.log(`PASS ${records.length} qualification refusal cases`);
