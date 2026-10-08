// First-party measurement wrapper. The actual production parser owns loading,
// decoding and extraction; exit after its completed frame lets the Windows
// host emit job accounting without its deliberate parent-EOF kill path.
const original=process.stdout.write.bind(process.stdout);
process.stdout.write=function(chunk,...arguments_){
  const result=original(chunk,...arguments_);
  if(String(chunk).includes('"result":'))setTimeout(()=>process.exit(0),25);
  return result;
};
await import('../lib/engine/adapters/python-worker.ts');
