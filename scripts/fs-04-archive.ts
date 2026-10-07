import assert from "node:assert/strict";
import {readFileSync,writeFileSync,unlinkSync} from "node:fs";
import {gzipSync,gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const root="docs/fs-04/evidence/",hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex"),records=[];
for(const file of ["baseline-parse.json","baseline-snapshot.json"]){
  const bytes=readFileSync(root+file),archive=file+".gz",compressed=gzipSync(bytes);
  writeFileSync(root+archive,compressed);assert.deepEqual(gunzipSync(readFileSync(root+archive)),bytes);
  records.push({file,originalBytes:bytes.length,originalHash:hash(bytes),archive,archiveBytes:compressed.length,archiveHash:hash(compressed)});
  unlinkSync(root+file);
}
writeFileSync(root+"snapshot-artifact.json",JSON.stringify({policy:"Lossless archive of generated FS04 verification output; original source and accepted FS00/01/02/03 artifacts untouched",records},null,2)+"\n");
console.log(JSON.stringify(records));
