import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {frameworkFact} from '../lib/parser/framework-budget.ts';
import {createComposedRefresh} from '../lib/engine/adapters/composed.ts';
import path from 'node:path';
// Reservation API unit qualification complements actual source expansion and
// mixed-project integration. Reservations do not manufacture graph evidence.
const snapshot=(await createComposedRefresh({host:path.resolve('src-tauri/target/debug/parser-host.exe')}).analyze('tests/fixtures/framework-support/F05-python',true)).snapshot;
const fresh=()=>structuredClone(snapshot),records=[];
const perFile=fresh();for(let n=0;n<19999;n++)frameworkFact(perFile,'controlled.py');frameworkFact(perFile,'controlled.py');assert.throws(()=>frameworkFact(perFile,'controlled.py'),/resource-limit/);frameworkFact(perFile,'other.py');records.push({case:'per-file',below:19999,at:20000,above:20001,status:'PASS',checks:['at succeeds','above refuses','other file has separate quota']});
const generation=fresh();for(let n=0;n<199999;n++)frameworkFact(generation,`controlled${Math.floor(n/20000)}.py`);frameworkFact(generation,'controlled9.py');assert.throws(()=>frameworkFact(generation,'controlled10.py'),/resource-limit/);frameworkFact(fresh(),'controlled.py');records.push({case:'generation',below:199999,at:200000,above:200001,status:'PASS',checks:['ten per-file quotas compose','generation above refuses','fresh generation recovers']});
writeFileSync('docs/fs-06/evidence/shared-fact-budgets.json',JSON.stringify({status:'PASS',scope:'Existing shared reservation API used by Django: unit ceilings, not fabricated graph facts. Source integration is separately qualified.',records,implementation:readFileSync('lib/parser/framework-budget.ts','utf8')},null,2)+'\n');console.log('PASS shared per-file/generation fact reservation budgets');
