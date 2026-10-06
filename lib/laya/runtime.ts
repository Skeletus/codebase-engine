import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { validateModel } from "./model.ts";
import { validateLayaInput } from "./input.ts";
import type { Ranker } from "../engine/ranking.ts";

export type Artifact = { file: URL; hash: string; qualified: boolean };
export class LocalLaya {
  private worker: Worker | null = null;
  private preparing: Promise<void> | null = null;
  private failure: string | null = null;
  private initializingReject: ((error: Error) => void) | null = null;
  private active: { reject: (error: Error) => void; resolve: (result: unknown) => void } | null = null;
  readonly measurements = { coldMs: 0, lastInferenceMs: 0, peakHeapBytes: 0, peakRssBytes: 0 };
  constructor(privateArtifact: Artifact) { this.artifact = privateArtifact; }
  private artifact: Artifact;
  async prepare(): Promise<void> {
    if (this.failure) throw new Error(this.failure);
    if (this.worker && !this.preparing) return;
    if (this.preparing) return this.preparing;
    const began = performance.now();
    this.preparing = this.start().then(() => { this.measurements.coldMs = performance.now() - began; }).catch((error: unknown) => {
      this.failure = error instanceof Error && ["model_unavailable", "model_corrupt", "model_not_qualified", "cancelled"].includes(error.message) ? error.message : "inference_failure";
      this.stop(); throw new Error(this.failure);
    }).finally(() => { this.preparing = null; });
    return this.preparing;
  }
  private async start(): Promise<void> {
    if (!this.artifact.qualified) throw new Error("model_not_qualified");
    let file;
    try { file = await open(this.artifact.file, "r"); } catch { throw new Error("model_unavailable"); }
    let bytes: Buffer;
    try {
      if ((await file.stat()).size > 65536) throw new Error("model_corrupt");
      const buffer = Buffer.alloc(65537), result = await file.read(buffer, 0, buffer.length, 0);
      bytes = buffer.subarray(0, result.bytesRead);
    } finally { await file.close(); }
    if (bytes.length > 65536 || createHash("sha256").update(bytes).digest("hex") !== this.artifact.hash) throw new Error("model_corrupt");
    let model;
    try { model = validateModel(JSON.parse(bytes.toString("utf8"))); } catch { throw new Error("model_corrupt"); }
    if (this.failure) throw new Error(this.failure);
    const worker = new Worker(new URL("./inference-worker.ts", import.meta.url), {
      workerData: model, env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 },
    });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Cleanup must reject initialization as failure, not user cancellation.
        // Otherwise the controller abandons the frontier instead of falling back.
        this.failure = "inference_failure";
        this.stop(); reject(new Error("inference_failure"));
      }, 1000);
      this.initializingReject = (error) => { clearTimeout(timer); reject(error); };
      const ready = (value: unknown) => {
        if (value && typeof value === "object" && "ready" in value && value.ready === true) { this.initializingReject = null; clearTimeout(timer); worker.off("message", ready); resolve(); }
      };
      worker.on("message", ready);
      worker.once("error", () => { clearTimeout(timer); reject(new Error("inference_failure")); this.invalidate(); });
      worker.once("exit", () => { clearTimeout(timer); if (this.worker === worker) { reject(new Error("inference_failure")); this.invalidate(); } });
    });
    worker.on("message", (value: unknown) => {
      if (!this.active) return;
      const active = this.active; this.active = null;
      if (!value || typeof value !== "object") { active.reject(new Error("inference_failure")); this.invalidate(); return; }
      const reply = Object.fromEntries(Object.entries(value));
      if (typeof reply.error === "string") { active.reject(new Error(reply.error === "outside_domain" || reply.error === "input_limit" ? reply.error : "inference_failure")); return; }
      if (typeof reply.elapsedMs !== "number" || !Number.isFinite(reply.elapsedMs) || reply.elapsedMs < 0 || typeof reply.heapBytes !== "number" || !Number.isSafeInteger(reply.heapBytes) || reply.heapBytes < 0 || Object.keys(reply).sort().join() !== "elapsedMs,heapBytes,result") { active.reject(new Error("inference_failure")); this.invalidate(); return; }
      this.measurements.lastInferenceMs = reply.elapsedMs; this.measurements.peakHeapBytes = Math.max(this.measurements.peakHeapBytes, reply.heapBytes); this.measurements.peakRssBytes = Math.max(this.measurements.peakRssBytes, process.memoryUsage().rss);
      active.resolve(reply.result);
    });
  }
  readonly ranker: Ranker = async (input, signal) => {
    if (signal.aborted) throw new Error("cancelled");
    const safe = validateLayaInput(input);
    if (Buffer.byteLength(JSON.stringify(safe)) > 4 * 1024 * 1024) throw new Error("input_limit");
    await this.prepare();
    if (signal.aborted) { this.invalidate(); throw new Error("cancelled"); }
    if (this.active || !this.worker) throw new Error("inference_failure");
    return new Promise((resolve, reject) => {
      const abort = () => { this.invalidate(); reject(new Error("cancelled")); };
      signal.addEventListener("abort", abort, { once: true });
      this.active = { resolve: (value) => { signal.removeEventListener("abort", abort); resolve(value); }, reject: (error) => { signal.removeEventListener("abort", abort); reject(error); } };
      try { this.worker!.postMessage(safe); } catch { this.invalidate(); }
    });
  };
  private invalidate() { this.failure = "inference_failure"; this.stop(); }
  private stop() {
    const active = this.active; this.active = null; active?.reject(new Error(this.failure ?? "cancelled"));
    const initializing = this.initializingReject; this.initializingReject = null; initializing?.(new Error(this.failure ?? "cancelled"));
    const worker = this.worker; this.worker = null; if (worker) void worker.terminate();
  }
  close(): void { this.failure = "cancelled"; this.stop(); }
}
