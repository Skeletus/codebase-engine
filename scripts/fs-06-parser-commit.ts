import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const host=path.resolve('src-tauri/target/debug/parser-host.exe'),entry=path.resolve('scripts/fs-06-parser-commit-worker.mjs');
const cases=[{name:'small',text:'from django.urls import path\nurlpatterns = []\n'},{name:'model-corpus',text:'from django.db import models\n'+Array.from({length:500},(_,i)=>`class Item${i}(models.Model):\n    value = models.CharField(max_length=80)\n`).join('')},{name:'malformed',text:'from django.urls import path\nurlpatterns = [path(\n'}];
const records=[];
for(const input of cases){
  const result=await new Promise<{output:Record<string,unknown>[];counters:Record<string,unknown>}>((resolve,reject)=>{
    const child=spawn(host,[process.execPath,entry],{windowsHide:true,env:{NODE_ENV:'production',SystemRoot:process.env.SystemRoot}});let output='',diagnostics='',sent=false;
    const timeout=setTimeout(()=>{child.kill();reject(Error('parser probe deadline'));},10000);
    child.on('error',reject);child.stdout.on('data',chunk=>{
      output+=chunk.toString();assert(Buffer.byteLength(output)<=8*1024*1024);
      if(!sent&&output.includes('\n')){const ready=JSON.parse(output.slice(0,output.indexOf('\n'))) as Record<string,unknown>;assert.equal(ready.ready,true);sent=true;
        const bytes=Buffer.from(input.text),header=Buffer.from(JSON.stringify({version:1,operation:'django',file:'controlled.py',bytes:bytes.length})),prefix=Buffer.alloc(4);prefix.writeUInt32BE(header.length);child.stdin.write(Buffer.concat([prefix,header,bytes]));
      }
    });child.stderr.on('data',chunk=>{diagnostics+=chunk.toString();assert(diagnostics.length<=65536);});
    child.on('close',code=>{clearTimeout(timeout);try{assert.equal(code,0);const frames=output.trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>);assert.equal(frames.length,2);assert(frames[1].result);const counters=JSON.parse(diagnostics.split(/\r?\n/).find(line=>line.startsWith('{'))??'null') as Record<string,unknown>;assert(counters);assert.equal(counters.memoryLimitBytes,536870912);assert(Number(counters.peakCommitBytes)>0&&Number(counters.peakCommitBytes)<=536870912);resolve({output:frames,counters});}catch(error){reject(error);}});
  });
  records.push({case:input.name,status:'PASS',bytes:Buffer.byteLength(input.text),sourceHash:createHash('sha256').update(input.text).digest('hex'),counters:result.counters});
}
writeFileSync('docs/fs-06/evidence/django-parser-commit.json',JSON.stringify({status:'PASS',scope:'Actual WASM Django parser worker Windows job commitment for controlled small/500-model/malformed inputs; not a whole-engine RAM ceiling',hostHash:createHash('sha256').update(readFileSync(host)).digest('hex'),records},null,2)+'\n');
console.log('PASS Django parser Windows peak commitment');
