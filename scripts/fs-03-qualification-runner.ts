import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
const targets=[["vite7-react18","browser-development"],["vite7-react18","browser-production"],["vite8-react19","browser-development"],["vite8-react19","browser-production"],["vite8-react19","ssr-production"]];
const tuple=process.argv.find(v=>v.startsWith("--tuple="))?.slice(8),profile=process.argv.find(v=>v.startsWith("--profile="))?.slice(10);
if(tuple&&!targets.some(([t])=>t===tuple)||profile&&!targets.some(([,p])=>p===profile)||process.argv.includes("--all")&&(tuple||profile))throw Error("Unknown or conflicting qualification filters");
if(!process.argv.includes("--all")&&(!tuple||!profile||!targets.some(([t,p])=>t===tuple&&p===profile)))throw Error("Use --all or an exact --tuple/--profile qualified pair");
const results=[];
for(const [t,p] of targets.filter(([t,p])=>process.argv.includes("--all")||t===tuple&&p===profile)){
  const output=execFileSync(process.execPath,["--test",`--test-name-pattern=qualification ${t}/${p}:`,"tests/framework-support/fs-03.test.ts"],{encoding:"utf8",env:{...process.env,FS03_TUPLE:t,FS03_PROFILE:p},timeout:120000});
  writeFileSync(`docs/fs-03/evidence/qualification-${t}-${p}.log`,output);
  const oracle=readFileSync(`docs/fs-03/evidence/${t}-${p}-expanded-oracle.json`);
  results.push({tuple:t,profile:p,status:"PASS",oracleRecordHash:createHash("sha256").update(oracle).digest("hex"),log:`qualification-${t}-${p}.log`});
  console.log(`${t}/${p}: PASS`);
}
writeFileSync("docs/fs-03/evidence/qualification-targets.json",JSON.stringify({results,blocked:[{tuple:"vite7-react18",profile:"ssr-production",status:"BLOCKED",reason:"Outside approved matrix"},{tuple:"nonexact/range/workspace",profile:"any",status:"BLOCKED",reason:"Exact qualification metadata required"}]},null,2)+"\n");
