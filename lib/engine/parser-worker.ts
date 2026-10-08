import { validateDjangoSyntax, type DjangoSyntax } from "./adapters/django-syntax.ts";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { PythonSyntax } from "./adapters/python-syntax.ts";
import { validatePythonSyntax } from "./adapters/python-contract.ts";
import { validateFlowSyntax } from "./adapters/flow-contract.ts";
import { verifyFlowRuntime } from "./adapters/flow-runtime.ts";
import type { FlowSyntax } from "./adapters/flow-syntax.ts";

export class ParserWorkerError extends Error {
  readonly reason: "parser-unavailable" | "resource-limit" | "cancelled" | "parse-error" | "unsupported-encoding";
  constructor(reason: ParserWorkerError["reason"]) { super(reason); this.reason = reason; }
}
const lease: { owner: SupervisedParserWorker | null } = { owner: null };
let closing: Promise<void> = Promise.resolve();
/** One active parser, application-owned launcher and entry, bounded binary input.
 * The launcher owns a kill-on-close Windows job; killing it contains the child. */
class SupervisedParserWorker {
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending: { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  private output = Buffer.alloc(0);
  private ready = false;
  private diagnosticBytes = 0;
  private stopped = false;
  private abort?: () => void;
  private readonly host: string;
  private readonly signal?: AbortSignal;
  private readonly runtime: "python" | "flow";
  protected constructor(host: string, signal: AbortSignal | undefined, runtime: "python" | "flow") { this.host = host; this.signal = signal; this.runtime = runtime; }
  async start(): Promise<void> {
    await closing;
    if (process.platform !== "win32" || !path.isAbsolute(this.host) || lease.owner || this.stopped) throw new ParserWorkerError("parser-unavailable");
    if (this.signal?.aborted) throw new ParserWorkerError("cancelled");
    lease.owner = this;
    try {
      const application = path.resolve(import.meta.dirname, "..", "..");
      const pkg = JSON.parse(readFileSync(path.join(application, "package.json"), "utf8")) as { name?: string };
      // Staged resources have a minimal application-owned package manifest.
      // Their complete parser asset inventory is mandatory before launch.
      if (!pkg.name && this.runtime === "python") {
        const manifest = JSON.parse(readFileSync(path.join(application, "python-runtime.json"), "utf8")) as Record<string, unknown>;
        const files = ["lib/engine/assets/python/tree-sitter-python.wasm", "lib/engine/assets/python/LICENSE", "node_modules/web-tree-sitter/tree-sitter.wasm", "node_modules/web-tree-sitter/tree-sitter.js", "node_modules/web-tree-sitter/LICENSE", "node_modules/web-tree-sitter/package.json", "bin/parser-host.exe"];
        if (manifest.version !== 1 || manifest.runtime !== "web-tree-sitter@0.25.10" || manifest.grammar !== "tree-sitter-python@0.25.0" || manifest.abi !== 15 || manifest.memoryBytes !== 536870912 || manifest.oldSpaceMiB !== 128 || manifest.startupMs !== 5000 || manifest.fileMs !== 2000 || !Array.isArray(manifest.assets) || manifest.assets.length !== files.length || this.host !== path.join(application, "bin/parser-host.exe")) throw new Error("parser-unavailable");
        for (const file of files) {
          const matches = manifest.assets.filter((asset: unknown) => !!asset && typeof asset === "object" && (asset as Record<string, unknown>).file === file);
          if (matches.length !== 1 || createHash("sha256").update(readFileSync(path.join(application, file))).digest("hex") !== (matches[0] as Record<string, unknown>).sha256) throw new Error("parser-unavailable");
        }
      }
      if (this.runtime === "flow") {
        verifyFlowRuntime();
        if (!pkg.name) {
          const runtime = JSON.parse(readFileSync(path.join(application, "flow-runtime.json"), "utf8")) as Record<string, unknown>;
          if (runtime.version !== 1 || runtime.runtime !== "hermes-parser@0.25.1" || runtime.memoryBytes !== 536870912 || runtime.oldSpaceMiB !== 128 || runtime.startupMs !== 5000 || runtime.fileMs !== 2000 || runtime.launcher !== "bin/parser-host.exe" || this.host !== path.join(application, "bin/parser-host.exe") || createHash("sha256").update(readFileSync(this.host)).digest("hex") !== runtime.launcherHash) throw Error("parser-unavailable");
        }
      }
      const environment: NodeJS.ProcessEnv = { NODE_ENV: "production" }; if (process.env.SystemRoot) environment.SystemRoot = process.env.SystemRoot;
      this.child = spawn(this.host, [process.execPath, path.resolve(import.meta.dirname, `adapters/${this.runtime}-worker.ts`)], { env: environment, windowsHide: true, cwd: path.resolve(import.meta.dirname, "..", "..") });
      // Writable callbacks do not consume EventEmitter error events. A killed
      // worker can report a late pipe failure after its request was settled.
      for (const stream of [this.child.stdin,this.child.stdout,this.child.stderr]) stream.on("error", () => { if (!this.stopped) this.fail("parser-unavailable"); });
      this.child.stdout.on("data", (bytes: Buffer) => this.receive(bytes));
      this.child.stderr.on("data", (bytes: Buffer) => { this.diagnosticBytes += bytes.length; if (this.diagnosticBytes > 65536) this.fail("resource-limit"); });
      this.child.on("error", () => this.fail("parser-unavailable"));
      this.child.on("exit", () => { if (!this.stopped) this.fail(this.ready ? "resource-limit" : "parser-unavailable"); });
      this.abort = () => this.fail("cancelled"); this.signal?.addEventListener("abort", this.abort, { once: true });
      await this.wait(5000, "parser-unavailable");
    } catch (error) { await this.close(); throw error instanceof ParserWorkerError ? error : new ParserWorkerError("parser-unavailable"); }
  }
  protected async request(file: string, bytes: Uint8Array, operation?: "django"): Promise<unknown> {
    if (!this.ready || this.pending || this.stopped) throw new ParserWorkerError("parser-unavailable");
    if (bytes.length > 1048576 || Buffer.byteLength(file) > 4000) throw new ParserWorkerError("resource-limit");
    if (this.signal?.aborted) throw new ParserWorkerError("cancelled");
    const header = Buffer.from(JSON.stringify({ version: 1, file, bytes: bytes.length, ...(operation ? { operation } : {}) })), prefix = Buffer.alloc(4); prefix.writeUInt32BE(header.length);
    if (header.length > 4096) throw new ParserWorkerError("resource-limit");
    const response = this.wait(2000, "resource-limit");
    this.child!.stdin.write(Buffer.concat([prefix, header, bytes]), error => { if (error) this.fail("parser-unavailable"); });
    const result = await response; if (!result) throw new ParserWorkerError("parse-error");
    return result;
  }
  private wait(milliseconds: number, reason: "resource-limit" | "parser-unavailable") {
    return new Promise<unknown>((resolve, reject) => { this.pending = { resolve, reject, timer: setTimeout(() => this.fail(reason), milliseconds) }; });
  }
  private receive(bytes: Buffer) {
    this.output = Buffer.concat([this.output, bytes]);
    if (this.output.length > 8 * 1024 * 1024) { this.fail("resource-limit"); return; }
    const newline = this.output.indexOf(10); if (newline < 0) return;
    if (newline !== this.output.length - 1 || !this.pending) { this.fail("parser-unavailable"); return; }
    try {
      const value: unknown = JSON.parse(this.output.subarray(0, newline).toString("utf8")); this.output = Buffer.alloc(0);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      const response = value as Record<string, unknown>; if (response.version !== 1) throw new Error();
      const keys = Object.keys(response).sort().join(",");
      if (![(this.runtime === "python" ? "abi,ready,version" : "ready,runtime,version"), "error,version", "result,version"].includes(keys)) throw new Error();
      if (response.error && !["parser-unavailable", "resource-limit", "parse-error", "unsupported-encoding"].includes(String(response.error))) throw new Error();
      const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer);
      if (response.error) {
        const reason = response.error;
        pending.reject(new ParserWorkerError(reason as "parser-unavailable" | "resource-limit" | "parse-error" | "unsupported-encoding"));
      } else if (!this.ready && response.ready === true && (this.runtime === "python" ? response.abi === 15 : response.runtime === "hermes-parser@0.25.1")) { this.ready = true; pending.resolve(null); }
      else if (this.ready && response.result && typeof response.result === "object") pending.resolve(response.result);
      else { pending.reject(new ParserWorkerError("parser-unavailable")); this.close(); }
    } catch { this.fail("parser-unavailable"); }
  }
  private fail(reason: ParserWorkerError["reason"]) {
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(new ParserWorkerError(reason)); }
    this.close();
  }
  close(): Promise<void> {
    if (this.stopped) return closing; this.stopped = true;
    if (this.abort) this.signal?.removeEventListener("abort", this.abort);
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(new ParserWorkerError("cancelled")); }
    const child = this.child; this.child = undefined;
    if (lease.owner !== this) return Promise.resolve();
    if (!child) { lease.owner = null; return Promise.resolve(); }
    closing = new Promise<void>(resolve => { child.once("close", () => { if (lease.owner === this) lease.owner = null; resolve(); }); });
    child.kill(); return closing;
  }
}

export class PythonParserWorker extends SupervisedParserWorker {
  constructor(host: string, signal?: AbortSignal) { super(host, signal, "python"); }
  async parse(file: string, bytes: Uint8Array): Promise<PythonSyntax> {
    const result = await this.request(file, bytes);
    try { return validatePythonSyntax(result, file, bytes); } catch { this.close(); throw new ParserWorkerError("parser-unavailable"); }
  }
  async parseDjango(file: string, bytes: Uint8Array): Promise<DjangoSyntax> {
    const result = await this.request(file, bytes, "django");
    try { return validateDjangoSyntax(result, file, bytes); } catch { this.close(); throw new ParserWorkerError("parser-unavailable"); }
  }
}

export class FlowParserWorker extends SupervisedParserWorker {
  constructor(host: string, signal?: AbortSignal) { super(host, signal, "flow"); }
  async parse(file: string, bytes: Uint8Array): Promise<FlowSyntax> {
    const result = await this.request(file, bytes);
    try { return validateFlowSyntax(result, file, bytes); } catch { this.close(); throw new ParserWorkerError("parser-unavailable"); }
  }
}

