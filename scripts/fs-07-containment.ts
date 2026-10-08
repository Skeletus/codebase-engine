import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const host = path.resolve("src-tauri/target/debug/parser-host.exe"), worker = path.resolve("scripts/fs-05-containment-worker.mjs");
async function run(operation: "allocate" | "complete" | "spin" | "heapoom") {
  const child = spawn(host, [process.execPath, worker], { windowsHide: true, env: { NODE_ENV: "production", SystemRoot: process.env.SystemRoot } });
  let output = "", diagnostics = "", timer: ReturnType<typeof setTimeout> | undefined, timedOut = false, sent = false;
  const start = performance.now();
  return await new Promise<{ operation: string; exitCode: number | null; timedOut: boolean; elapsedMs: number; records: Record<string, unknown>[]; counters: Record<string, unknown> | null }>((resolve, reject) => {
    const startup = setTimeout(() => { child.kill(); reject(new Error("probe-startup-timeout")); }, 5000);
    child.on("error", reject);
    child.stdout.on("data", bytes => {
      output += bytes.toString(); assert(output.length < 65536);
      if (!sent && output.includes("\n")) { clearTimeout(startup); sent = true; child.stdin.write(JSON.stringify({operation}) + "\n"); if (operation === "spin" || operation === "heapoom") timer = setTimeout(() => { timedOut = true; child.kill(); }, operation === "spin" ? 50 : 15000); }
    });
    child.stderr.on("data", bytes => { diagnostics += bytes.toString(); assert(diagnostics.length < 65536); });
    child.on("close", code => { clearTimeout(startup); if (timer) clearTimeout(timer); const counters = diagnostics.split(/\r?\n/).find(line => line.startsWith("{")); resolve({ operation, exitCode: code, timedOut, elapsedMs: performance.now() - start, records: output.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>), counters: counters ? JSON.parse(counters) as Record<string, unknown> : null }); });
  });
}
const records = [];
for (const operation of ["allocate", "complete", "spin", "complete", "heapoom", "complete"] as const) {
  const result = await run(operation);
  assert(result.records[0].ready); assert(Array.isArray(result.records[0].flags));
  const pid = Number(result.records[0].pid);
  assert(Number.isSafeInteger(pid) && pid > 0);
  // Host close must also reap the contained worker, including the spin case.
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  for (const flag of ["--max-old-space-size=128", "--wasm-num-compilation-tasks=1", "--no-wasm-tier-up", "--no-wasm-dynamic-tiering"]) assert(result.records[0].flags.includes(flag));
  if (operation === "allocate") { assert.equal(result.records[1].rejected, true); assert.equal(result.exitCode, 0); assert.equal(result.counters?.memoryLimitBytes, 536870912); assert(Number(result.counters?.peakCommitBytes) <= 536870912); }
  if (operation === "spin") { assert(result.timedOut); assert(!result.records.some(r => r.complete)); }
  if (operation === "heapoom") { assert(!result.timedOut); assert.equal(result.exitCode,2);assert.equal(result.counters?.memoryLimitBytes,536870912);assert(Number(result.counters?.peakCommitBytes)<=536870912); }
  if (operation === "complete") { assert(result.records[1].complete); assert.equal(result.exitCode, 0); }
  records.push(result);
}
writeFileSync("docs/fs-07/evidence/containment.json", JSON.stringify({ platform: process.platform, node: process.version, helperHash: createHash("sha256").update(readFileSync(host)).digest("hex"), probeHash: createHash("sha256").update(readFileSync(worker)).digest("hex"), records }, null, 2) + "\n");
process.stdout.write("PASS allocation containment, deadline kill and fresh recovery\n");
