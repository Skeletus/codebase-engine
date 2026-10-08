import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PythonParserWorker} from '../lib/engine/parser-worker.ts';
const host=path.resolve('src-tauri/target/debug/parser-host.exe');
const cases=[{name:'observation-or-node-ceiling',text:Array.from({length:20001},(_,i)=>`x${i} = 0\n`).join('')},{name:'argument-ceiling',text:'f('+Array(201).fill('0').join(',')+')\n'},{name:'expression-text-ceiling',text:"value = '"+'a'.repeat(4097)+"'\n"}];
const records=[];
for(const input of cases){const worker=new PythonParserWorker(host),start=performance.now();try{await worker.start();if(input.name==='expression-text-ceiling'){const syntax=await worker.parseDjango('controlled.py',Buffer.from(input.text));assert.equal(syntax.inputs.find(i=>i.kind==='assignment')?.value,'');assert(syntax.inputs.every(i=>i.value.length<=4096));}else await assert.rejects(worker.parseDjango('controlled.py',Buffer.from(input.text)),/resource-limit/);}finally{await worker.close();}
  const fresh=new PythonParserWorker(host);try{await fresh.start();assert((await fresh.parseDjango('fresh.py',Buffer.from('x=1\n'))).inputs.some(i=>i.kind==='assignment'));}finally{await fresh.close();}
  records.push({case:input.name,status:'PASS',outcome:input.name==='expression-text-ceiling'?'bounded empty observation; no truncated literal promoted':'typed resource-limit refusal',bytes:Buffer.byteLength(input.text),sourceHash:createHash('sha256').update(input.text).digest('hex'),elapsedMs:performance.now()-start});
}
writeFileSync('docs/fs-06/evidence/django-resource-probes.json',JSON.stringify({status:'PASS',scope:'Private Django node/observation and argument typed refusals, expression text bounded omission, and fresh real-worker recovery. Not full generation/template/route/binding/read ceilings or peak commitment qualification.',harnessHash:createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),records},null,2)+'\n');
console.log(`PASS ${records.length} Django observation resource bounds and recovery`);
