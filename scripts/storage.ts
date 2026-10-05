import { SqliteAnalysisStore, StorageError } from "../lib/storage/sqlite.ts";
import { createHash } from "node:crypto";
import { validateStorageRequest } from "../lib/desktop/storage-protocol.ts";
import { MAX_REQUEST_BYTES, MAX_EVENT_BYTES } from "../lib/desktop/protocol.ts";

const database = process.env.CODE_INTELLIGENCE_DB;
if (!database) process.exit(2);
globalThis.fetch = () => { throw new Error("Local storage network access denied"); };
let input = Buffer.alloc(0), done = false;
process.stdin.on("data", (chunk: Buffer) => {
  if (done) process.exit(2);
  input = Buffer.concat([input, chunk]);
  if (input.length > MAX_REQUEST_BYTES) process.exit(2);
  if (!input.includes(10)) return;
  done = true;
  let store: SqliteAnalysisStore | undefined;
  try {
    const request = validateStorageRequest(JSON.parse(input.toString("utf8")));
    store = new SqliteAnalysisStore(database);
    // Native cancellation owns its PID-scoped outcome. Do not relabel the
    // freshly stopped process as interrupted before recording cancellation.
    if (request.type !== "finish") store.recover();
    let result: unknown;
    switch (request.type) {
      case "explanation-digest": result = createHash("sha256").update(request.input).digest("hex"); break;
      case "explanation-cache": result = store.explanationCache(request.repositoryId, request.key, request.answer); break;
      case "list": result = store.list(); break;
      case "register": {
        const root = process.env.CODE_INTELLIGENCE_ROOT;
        if (!root) throw new Error("Native selection required");
        result = store.register(root); break;
      }
      case "lookup": result = store.repository(request.repositoryId); break;
      case "forget": store.forget(request.repositoryId); result = null; break;
      case "finish": store.finish(request.jobId, request.state, request.ownerPid); result = null; break;
      case "settings": result = store.settings(request.initialTheme); break;
      case "theme": store.setTheme(request.theme); result = store.settings(); break;
      case "measurement": store.recordMeasurement(request.input, request.applicationVersion); result = store.measurements(); break;
      case "measurements": result = store.measurements(); break;
      case "reset-measurements": store.resetMeasurements(); result = store.measurements(); break;
    }
    const frame = JSON.stringify({ version: 1, ok: true, result });
    if (Buffer.byteLength(frame) > MAX_EVENT_BYTES) throw new Error("Storage response budget exceeded");
    process.stdout.write(frame + "\n");
  } catch (error) {
    // Repository-derived exception text and database paths never enter logs.
    process.stdout.write(JSON.stringify({ version: 1, ok: false, error: error instanceof StorageError ? error.message : "Local storage operation failed. Check application storage access and available disk space." }) + "\n");
    process.exitCode = 1;
  } finally { store?.close(); process.stdin.destroy(); }
});
process.stdin.on("end", () => { if (!done) process.exitCode = 2; });
