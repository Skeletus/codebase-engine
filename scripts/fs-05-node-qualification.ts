import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
const targets=[...['next15','next16-preservation','next16-patch'].flatMap(tuple=>['node-development','node-production','browser'].map(profile=>({tuple,profile}))),...['node22','node24'].flatMap(tuple=>['node-development','node-production'].map(profile=>({tuple,profile})))];
const tuple=process.argv.find(a=>a.startsWith('--tuple='))?.slice(8),profile=process.argv.find(a=>a.startsWith('--profile='))?.slice(10),all=process.argv.includes('--all');
assert(all || tuple&&profile,'Use --all or exact --tuple and --profile');assert(!(all&&(tuple||profile)),'Conflicting filters');if(!all)assert(targets.some(t=>t.tuple===tuple&&t.profile===profile),'Unknown qualification target');
const results=[];
for(const target of targets.filter(t=>all||t.tuple===tuple&&t.profile===profile)){const log=`qualification-${target.tuple}-${target.profile}.log`;const output=execFileSync(process.execPath,['--test',`--test-name-pattern=F04 ${target.tuple}/${target.profile}:`,'tests/framework-support/fs-04.test.ts'],{encoding:'utf8',timeout:120000});assert(/pass 1\b/.test(output)&&/fail 0\b/.test(output),'Missing profile execution');writeFileSync('docs/fs-05/evidence/node-preservation-'+log,output);results.push({...target,status:'PASS',log});console.log(`${target.tuple}/${target.profile}: PASS`);}
writeFileSync('docs/fs-05/evidence/node-preservation-qualification-targets.json',JSON.stringify({results,testHash:createHash('sha256').update(readFileSync('tests/framework-support/fs-04.test.ts')).digest('hex'),blocked:['Native Node browser execution','unknown/range framework tuples','Edge runtime and custom loaders'],policy:'Explicit controlled targets; unavailable/missing/unknown targets fail'},null,2)+'\n');

