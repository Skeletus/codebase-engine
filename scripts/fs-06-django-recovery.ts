import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PythonParserWorker} from '../lib/engine/parser-worker.ts';

// Application-owned fault hosts are built by fs-06-parent-faults.ts. This
// probe sends the Django operation through the same production transport.
const host=path.resolve('src-tauri/target/debug/parser-host.exe');
const directory=path.resolve('node_modules/.fs05-experiments/parent-faults');
const records:{case:string;status:string;expected:string}[]=[];
async function recovery(){const fresh=new PythonParserWorker(host);try{await fresh.start();const parsed=await fresh.parseDjango('fresh.py',Buffer.from('def fresh():\n    pass\n'));assert(parsed.inputs.some(i=>i.kind==='function'&&i.name==='fresh'));}finally{await fresh.close();}}
for(const [mode,reason]of [['exit-during-frame','resource-limit|parser-unavailable'],['output','resource-limit'],['diagnostics','resource-limit'],['parse-timeout','resource-limit'],['invalid-result','parser-unavailable'],['diagnostics-below','parser-unavailable'],['diagnostics-at','parser-unavailable']]){
  const worker=new PythonParserWorker(path.join(directory,mode+'.exe'));
  try{await worker.start();await assert.rejects(worker.parseDjango('controlled.py',Buffer.from(mode==='exit-during-frame'?'#'+'a'.repeat(1048574)+'\n':'x=1\n')),new RegExp(reason));}finally{await worker.close();}
  await recovery();records.push({case:mode,status:'PASS',expected:reason});
}
const controller=new AbortController(),worker=new PythonParserWorker(host,controller.signal);
try{await worker.start();const pending=worker.parseDjango('cancelled.py',Buffer.from('def cancelled():\n    pass\n'));controller.abort();await assert.rejects(pending,/cancelled/);}finally{await worker.close();}
await recovery();records.push({case:'in-flight-Django-operation-cancellation-and-fresh-recovery',status:'PASS',expected:'cancelled'});
writeFileSync('docs/fs-06/evidence/django-operation-recovery.json',JSON.stringify({status:'PASS',scope:'Django transport operation, strict result shape, in-flight cancellation and fresh real-worker recovery; not a watch or full resource-ceiling qualification',harnessHash:createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),records},null,2)+'\n');
console.log(`PASS ${records.length} Django operation recovery cases`);
