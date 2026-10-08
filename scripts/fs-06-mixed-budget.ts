import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
import {AnalysisCoordinator} from '../lib/engine/coordinator.ts';
import {typescriptDriver} from '../lib/engine/adapters/typescript.ts';
import {pythonExtension} from '../lib/engine/adapters/python.ts';
import {SqliteAnalysisStore} from '../lib/storage/sqlite.ts';
const input=JSON.parse(readFileSync('tests/fixtures/framework-support/F06-django/sources.json','utf8').replace(/^\uFEFF/,'')) as Record<string,string>;
input['app/core.py']='value = 1\n';input['main.ts']='export const preserved = 1;\n';
for(let n=0;n<80;n++)input[`app/imports${n}.py`]='import app.core\n'.repeat(250);
const root=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 mixed budget ')),host=path.resolve('src-tauri/target/debug/parser-host.exe'),started=performance.now();
try{
  for(const [file,text]of Object.entries(input)){mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text);}
  const before=(await new AnalysisCoordinator(typescriptDriver()).analyzeAsync(root,true,[pythonExtension({host})])).snapshot;
  const beforeBytes=Buffer.byteLength(JSON.stringify(before));assert(before.analysis.bindings.length>20000);assert(beforeBytes<=31*1024*1024);
  const after=(await createComposedRefresh({host}).analyze(root,true)).snapshot;assert.equal(after.analysis.registrations.length,4);assert.deepEqual(after.relationships,before.relationships);assert.deepEqual(after.behavior,before.behavior);
  const bindings=new Map(after.analysis.bindings.map(binding=>[binding.id,binding]));for(const binding of before.analysis.bindings)assert.deepEqual(bindings.get(binding.id),binding);
  const afterBytes=Buffer.byteLength(JSON.stringify(after));assert(afterBytes<=31*1024*1024);
  const store=new SqliteAnalysisStore(path.join(root,'verification.sqlite'));try{const repository=store.register(root);store.begin(repository.repositoryId,'before');store.publish(repository.repositoryId,'before',before);assert.deepEqual(store.load(repository.repositoryId),before);store.begin(repository.repositoryId,'after');store.publish(repository.repositoryId,'after',after);assert.deepEqual(store.load(repository.repositoryId),after);}finally{store.close();}
  writeFileSync('docs/fs-06/evidence/mixed-budget.json',JSON.stringify({status:'PASS',profile:'static-python-declared-environment',sourceHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),beforeBindings:before.analysis.bindings.length,afterBindings:after.analysis.bindings.length,addedDjangoBindings:after.analysis.bindings.length-before.analysis.bindings.length,beforeBytes,afterBytes,elapsedMs:performance.now()-started,checks:['real accepted TS/Python adapter baseline above 20,000 shared bindings','serialized baseline within inherited snapshot budget','every pre-existing binding preserved exactly','exact dependencies and lexical behavior unchanged','Django adds qualified routes without charging previous bindings']},null,2)+'\n');console.log('PASS mixed TS/Python/Django binding budget');
}finally{assert(path.basename(root).startsWith('cartograph FS06 mixed budget '));rmSync(root,{recursive:true,force:true});}
