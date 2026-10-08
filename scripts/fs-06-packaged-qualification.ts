import assert from 'node:assert/strict';
import {cpSync,copyFileSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const tuple=process.argv.find(arg=>arg.startsWith('--tuple='))?.slice(8);
assert(tuple==='django52'||tuple==='django60','Explicit tuple required');
const temp=mkdtempSync(path.join(os.tmpdir(),'cartograph FS06 packaged qualification '));
try{
  const engine=path.join(temp,'engine'),runtime=path.join(temp,'node.exe');
  cpSync('src-tauri/resources/generated/engine',engine,{recursive:true});copyFileSync('src-tauri/binaries/code-engine-x86_64-pc-windows-msvc.exe',runtime);
  mkdirSync(path.join(engine,'tests/framework-support'),{recursive:true});mkdirSync(path.join(engine,'docs/fs-06/evidence'),{recursive:true});
  cpSync('tests/fixtures/framework-support/F06-django',path.join(engine,'tests/fixtures/framework-support/F06-django'),{recursive:true});
  copyFileSync('docs/fs-06/evidence/framework-oracles.json',path.join(engine,'docs/fs-06/evidence/framework-oracles.json'));
  const source=readFileSync('tests/framework-support/fs-06.test.ts','utf8');
  const declaration='const host=path.resolve("src-tauri/target/debug/parser-host.exe");';assert(source.includes(declaration));
  writeFileSync(path.join(engine,'tests/framework-support/fs-06.test.ts'),source.replace(declaration,'const host=path.resolve("bin/parser-host.exe");'));
  writeFileSync(path.join(engine,'offline.mjs'),"import assert from 'node:assert/strict';import {createRequire} from 'node:module';import net from 'node:net';const require=createRequire(import.meta.url);assert.equal(process.env.PATH,'');for(const name of ['python','next','react','typescript','pnpm'])assert.throws(()=>require.resolve(name));globalThis.fetch=()=>{throw Error('denied egress')};net.connect=()=>{throw Error('denied egress')};net.createConnection=net.connect;\n");
  const output=execFileSync(runtime,['--import',pathToFileURL(path.join(engine,'offline.mjs')).href,'--test','--test-name-pattern',`^FS06 qualification ${tuple} |^FS06 explicit installed app association|^FS06 middleware hooks|^FS06 real Windows watch`,'tests/framework-support/fs-06.test.ts'],{cwd:engine,env:{PATH:'',SystemRoot:process.env.SystemRoot,NODE_ENV:'production'},encoding:'utf8',timeout:360000,maxBuffer:8*1024*1024});
  assert(/pass 12\b/.test(output),output);assert(/fail 0\b/.test(output));
  writeFileSync(`docs/fs-06/evidence/packaged-qualification-${tuple}.log`,output);
  writeFileSync(`docs/fs-06/evidence/packaged-qualification-${tuple}.json`,JSON.stringify({status:'PASS',tuple,profile:'static-python-declared-environment',tests:12,checks:['controlled qualification matrix','installed apps.py association','middleware declarations','Windows watch publication and pause','empty PATH','no system Python/development tooling','denied parent egress'],testHash:createHash('sha256').update(source).digest('hex'),outputHash:createHash('sha256').update(output).digest('hex'),runtimeManifest:JSON.parse(readFileSync(path.join(engine,'python-runtime.json'),'utf8'))},null,2)+'\n');
  console.log(`PASS packaged ${tuple} qualification`);
}finally{assert(path.basename(temp).startsWith('cartograph FS06 packaged qualification '));rmSync(temp,{recursive:true,force:true});}
