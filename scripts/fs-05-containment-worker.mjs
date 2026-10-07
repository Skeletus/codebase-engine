// Application-owned qualification probe; never imported by production analysis.
let buffered = '';
process.stdin.on('data', chunk => {
  buffered += chunk.toString();
  const lines = buffered.split('\n'); buffered = lines.pop();
  for (const line of lines) {
    if (line === 'FS05-JOB-ASSIGNED') { process.stdout.write(JSON.stringify({ready:true,pid:process.pid,flags:process.execArgv})+'\n'); continue; }
    const command = JSON.parse(line);
    if (command.operation === 'allocate') {
      let rejected = false;
      try { new WebAssembly.Memory({initial:8192,maximum:8192}); } catch { rejected = true; }
      process.stdout.write(JSON.stringify({rejected})+'\n'); process.exit(rejected ? 0 : 2);
    } else if (command.operation === 'heapoom') { const retained=[];while(true)retained.push(Array.from({length:50000},(_,i)=>({i,text:'x'.repeat(128)}))); }
    else if (command.operation === 'spin') { while (true) {} }
    else if (command.operation === 'complete') { process.stdout.write('{"complete":true}\n'); process.exit(0); }
    else process.exit(2);
  }
});
