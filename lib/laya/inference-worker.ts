import { parentPort, workerData } from "node:worker_threads";
import { infer, validateModel } from "./model.ts";
import { validateLayaInput } from "./input.ts";

globalThis.fetch = async () => { throw new Error("Local inference egress denied"); };
const model = validateModel(workerData);
if (!parentPort) throw new Error("Inference requires its supervised worker");
const port = parentPort;
port.on("message", (value: unknown) => {
  const began = performance.now();
  try {
    const input = validateLayaInput(value), result = infer(model, input);
    port.postMessage({ result, elapsedMs: performance.now() - began, heapBytes: process.memoryUsage().heapUsed });
  } catch (error) {
    port.postMessage({ error: error instanceof Error && ["input_limit", "outside_domain"].includes(error.message) ? error.message : "inference_failure" });
  }
});
port.postMessage({ ready: true });
