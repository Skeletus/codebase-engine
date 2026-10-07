import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const oracleFile="docs/fs-05/evidence/syntax-oracles.json",qualificationFile="docs/fs-05/evidence/qualification.json";
const oracle=readFileSync(oracleFile),qualification=readFileSync(qualificationFile),records=[];
try{
  for(const mode of ["missing-oracle","wrong-version","unknown-profile"]){
    writeFileSync(oracleFile,mode==="missing-oracle"?"[]":mode==="wrong-version"?oracle.toString().replace('"3.12.15"','"3.12.14"'):oracle);
    const args=["scripts/fs-05-qualification.ts","--tuple=python31215",...(mode==="unknown-profile"?["--profile=unqualified-environment"]:[])];
    assert.throws(()=>execFileSync(process.execPath,args,{timeout:10000,stdio:"pipe"}),error=>!!error&&typeof error==="object"&&"status"in error&&error.status===1);
    if(mode!=="unknown-profile"){const result=JSON.parse(readFileSync(qualificationFile,"utf8"));assert.equal(result.length,1);assert.equal(result[0].status,"UNVERIFIED");assert(result[0].missingProof.includes("Missing/stale exact-version oracle"));}
    records.push({mode,status:"PASS",exitCode:1});
  }
}finally{writeFileSync(oracleFile,oracle);writeFileSync(qualificationFile,qualification);}
writeFileSync("docs/fs-05/evidence/qualification-negative.json",JSON.stringify({records,policy:"Original retained positive oracle/qualification bytes restored exactly"},null,2)+"\n");process.stdout.write("PASS missing/version/profile proof gates\n");
