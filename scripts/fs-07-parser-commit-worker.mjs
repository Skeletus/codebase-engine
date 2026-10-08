// Application-owned measurement wrapper. Parse only controlled fixture bytes
// through the real production worker, then exit so its host reports job commit.
const original=process.stdout.write.bind(process.stdout);
process.stdout.write=function(chunk,...arguments_){
  const result=original(chunk,...arguments_);
  if(String(chunk).includes('"result":')||String(chunk).includes('"error":'))setTimeout(()=>process.exit(0),25);
  return result;
};
await import('../lib/engine/adapters/flow-worker.ts');
