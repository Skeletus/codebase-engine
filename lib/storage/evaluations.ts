import { DatabaseSync } from "node:sqlite";
import { chmodSync, lstatSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateSnapshot } from "../engine/contract.ts";
import { evaluate, validateEvaluationCase, type EvaluationCase } from "../engine/evaluation.ts";

/** Separate local repository-derived evaluation store; never pilot telemetry/cache. */
export class EvaluationStore {
  private db: DatabaseSync;
  constructor(file: string) {
    if (!path.isAbsolute(file)) throw new Error("Evaluation database requires an absolute local path");
    try { const stat = lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Evaluation database must be a regular file"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.db = new DatabaseSync(file);
    if (process.platform !== "win32") chmodSync(file, 0o600);
    this.db.exec("PRAGMA secure_delete=ON; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS evaluations (id TEXT PRIMARY KEY, payload TEXT NOT NULL, result TEXT NOT NULL)");
  }
  async save(input: EvaluationCase, consent: boolean): Promise<string> {
    if (consent !== true) throw new Error("Explicit local evaluation consent is required");
    const safe = { ...input, snapshot: validateSnapshot(input.snapshot) }; validateEvaluationCase(safe);
    const result = await evaluate(safe);
    const payload = JSON.stringify(safe), recorded = JSON.stringify(result);
    if (Buffer.byteLength(payload) + Buffer.byteLength(recorded) > 32 * 1024 * 1024) throw new Error("Evaluation record exceeds 32 MB");
    const id = randomUUID(); this.db.prepare("INSERT INTO evaluations VALUES (?, ?, ?)").run(id, payload, recorded); return id;
  }
  list(): string[] { return this.db.prepare("SELECT id FROM evaluations ORDER BY id").all().map((row) => String(row.id)); }
  read(id: string): { input: EvaluationCase; result: unknown } {
    const row = this.db.prepare("SELECT payload, result FROM evaluations WHERE id = ?").get(id);
    if (!row) throw new Error("Unknown evaluation record");
    const input: EvaluationCase = JSON.parse(String(row.payload));
    input.snapshot = validateSnapshot(input.snapshot); validateEvaluationCase(input);
    return { input, result: JSON.parse(String(row.result)) };
  }
  delete(id: string): void { this.db.prepare("DELETE FROM evaluations WHERE id = ?").run(id); }
  close(): void { this.db.close(); }
}
