import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, realpathSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { validateEvent, MAX_EVENT_BYTES } from "../lib/desktop/protocol.ts";

const release = process.argv.includes("--release");
const resources = path.resolve(release ? "src-tauri/target/release/engine" : "src-tauri/resources/generated/engine");
const runtime = JSON.parse(readFileSync(path.join(resources, "runtime.json"), "utf8"));
const executable = path.resolve(release ? `src-tauri/target/release/code-engine${process.platform === "win32" ? ".exe" : ""}` : `src-tauri/binaries/code-engine-${runtime.target}${process.platform === "win32" ? ".exe" : ""}`);
const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cartograph-smoke-")));
const nativeRoot = path.toNamespacedPath(root);
writeFileSync(path.join(root, "a.ts"), 'import { b } from "./b"; export const a = b;\n');
writeFileSync(path.join(root, "b.ts"), "export const b = 1;\n");
// No PATH, system Node, cloud configuration or repository node_modules.
// Explicitly empty PATH: Node/libuv silently supplies Windows OS variables
// (including PATH) when absent. Native shell-plugin tests cover the truly
// cleared environment with only SystemRoot and the authorized root retained.
const child = spawn(executable, [path.join(resources, "scripts/sidecar.ts")], { cwd: resources, env: { NODE_ENV: "production", PATH: "", CODE_INTELLIGENCE_ROOT: nativeRoot }, stdio: ["pipe", "pipe", "pipe"] });
const timeout = setTimeout(() => child.kill(), 20000);
let buffer = "", complete = false;
child.stdout.on("data", (data: Buffer) => {
  buffer += data.toString();
  if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) throw new Error("Smoke-test event limit exceeded");
  while (buffer.includes("\n")) {
    const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    const event = validateEvent(JSON.parse(line));
    if (event.type === "error") throw new Error("Bundled engine reported a failure");
    if (event.type === "complete") {
      if (event.snapshot.files.length !== 2 || event.snapshot.relationships.length !== 1) throw new Error("Bundled engine snapshot mismatch");
      complete = true; child.stdin.end();
    }
  }
});
child.stdin.write(JSON.stringify({ version: 1, jobId: "smoke", requestId: "smoke", type: "analyze", root: nativeRoot }) + "\n");
child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!path.basename(root).startsWith("cartograph-smoke-")) throw new Error("Unexpected smoke directory");
  rmSync(root, { recursive: true, force: true });
  if (code !== 0 || !complete) { console.error("Bundled runtime smoke test failed"); process.exitCode = 1; }
  else console.log(`PASS: bundled Node ${runtime.node}, no PATH/accounts/repository dependencies, correct graph and clean shutdown`);
});
