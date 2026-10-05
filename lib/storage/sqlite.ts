import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { accessSync, constants, chmodSync, lstatSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { validateSnapshot } from "../engine/contract.ts";
import { SNAPSHOT_VERSION, type CodeSnapshot } from "../engine/types.ts";
import type { AnalysisStore, JobState, StoredRepository } from "./types.ts";
import { validateMeasurement, validateApplicationVersion, type MeasurementInput, type Measurement } from "./measurements.ts";

// Canonical snapshots are the only persisted graph representation. No source,
// ASTs, UI projections or adjacency indexes belong in this schema.
const MIGRATIONS = [
  `CREATE TABLE repositories (id TEXT PRIMARY KEY, root TEXT UNIQUE NOT NULL);
   CREATE TABLE snapshots (repository_id TEXT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
     version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE jobs (id TEXT PRIMARY KEY, repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
     state TEXT NOT NULL CHECK(state IN ('running','complete','failed','cancelled','interrupted')),
     owner_pid INTEGER NOT NULL, started_at TEXT NOT NULL, finished_at TEXT);
   CREATE UNIQUE INDEX one_refresh_per_repository ON jobs(repository_id) WHERE state = 'running';
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE repository_settings (repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
     key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(repository_id,key));`,
  `CREATE TABLE pilot_measurements (
    category TEXT NOT NULL CHECK(category IN ('understanding','impact','ask')),
    elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms BETWEEN 1 AND 86400000),
    usefulness INTEGER NOT NULL CHECK(usefulness BETWEEN 1 AND 5),
    discovered INTEGER NOT NULL CHECK(discovered BETWEEN 0 AND 100000),
    missed INTEGER NOT NULL CHECK(missed BETWEEN 0 AND 100000), application_version TEXT NOT NULL);`,
];
export class StorageError extends Error {
  readonly code: "storage_failure" | "incompatible_storage" | "incompatible_snapshot" | "refresh_conflict" | "unknown_repository";
  constructor(code: StorageError["code"], message: string) { super(message); this.code = code; }
}
export function migrate(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = Number(db.prepare("PRAGMA user_version").get()?.user_version);
    if (!Number.isSafeInteger(version) || version < 0 || version > migrations.length) throw new StorageError("incompatible_storage", "Local storage is from a newer application. Keep it and use a compatible application version.");
    for (let i = version; i < migrations.length; i++) { db.exec(migrations[i]); db.exec(`PRAGMA user_version = ${i + 1}`); }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
function available(root: string): boolean {
  try { accessSync(root, constants.R_OK | constants.X_OK); return statSync(root).isDirectory() && realpathSync.native(root) === root; } catch { return false; }
}
function live(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}
export class SqliteAnalysisStore implements AnalysisStore {
  private db: DatabaseSync;
  constructor(file: string) {
    if (!path.isAbsolute(file)) throw new StorageError("storage_failure", "Storage path must be application-owned and absolute.");
    try { if (!lstatSync(file).isFile()) throw new StorageError("storage_failure", "Storage must be a regular file."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.db = new DatabaseSync(file, { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false });
    try {
      if (process.platform !== "win32") chmodSync(file, 0o600);
      this.db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;");
      migrate(this.db);
    } catch (error) { this.db.close(); throw error; }
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  register(root: string): StoredRepository {
    const canonical = realpathSync.native(root);
    if (!statSync(canonical).isDirectory()) throw new StorageError("storage_failure", "Choose an accessible directory.");
    this.db.prepare("INSERT INTO repositories(id,root) VALUES (?,?) ON CONFLICT(root) DO NOTHING").run(randomUUID(), canonical);
    const row = this.db.prepare("SELECT id FROM repositories WHERE root=?").get(canonical)!;
    this.opened(String(row.id));
    return this.repository(String(row.id));
  }
  list(): StoredRepository[] { this.recover(); return this.db.prepare("SELECT r.id FROM repositories r LEFT JOIN repository_settings s ON s.repository_id=r.id AND s.key='last_opened_at' ORDER BY s.value DESC,r.root").all().map((r) => this.repository(String(r.id))); }
  private opened(id: string): void {
    this.db.prepare("INSERT INTO repository_settings(repository_id,key,value) VALUES (?,'last_opened_at',?) ON CONFLICT(repository_id,key) DO UPDATE SET value=excluded.value").run(id, new Date().toISOString());
  }
  repository(id: string): StoredRepository {
    const row = this.db.prepare("SELECT root FROM repositories WHERE id=?").get(id);
    if (!row) throw new StorageError("unknown_repository", "Repository is no longer registered locally.");
    const snapshot = this.db.prepare("SELECT version,payload,updated_at FROM snapshots WHERE repository_id=?").get(id);
    let snapshotState: StoredRepository["snapshotState"] = "none";
    if (snapshot) {
      snapshotState = "incompatible";
      try { if (Number(snapshot.version) === SNAPSHOT_VERSION && validateSnapshot(JSON.parse(String(snapshot.payload))).origin.root === row.root) snapshotState = "compatible"; } catch { /* Retain invalid/old data for safe reanalysis. */ }
    }
    const job = this.db.prepare("SELECT id,state FROM jobs WHERE repository_id=? ORDER BY rowid DESC LIMIT 1").get(id);
    return { repositoryId: id, root: String(row.root), available: available(String(row.root)), snapshotState,
      updatedAt: snapshot ? String(snapshot.updated_at) : null, lastJob: job ? { id: String(job.id), state: job.state as JobState } : null };
  }
  load(id: string): CodeSnapshot | null {
    const repo = this.repository(id);
    if (repo.snapshotState === "none") return null;
    if (repo.snapshotState !== "compatible") throw new StorageError("incompatible_snapshot", "Stored analysis is incompatible. Refresh to reanalyze; the stored data has been retained.");
    this.opened(id);
    return validateSnapshot(JSON.parse(String(this.db.prepare("SELECT payload FROM snapshots WHERE repository_id=?").get(id)!.payload)));
  }
  begin(id: string, job: string): void {
    this.repository(id);
    this.transaction(() => {
      this.recover();
      if (this.db.prepare("SELECT id FROM jobs WHERE repository_id=? AND state='running'").get(id)) throw new StorageError("refresh_conflict", "Another refresh owns this repository. Cancel it or wait for it to finish.");
      this.db.prepare("INSERT INTO jobs(id,repository_id,state,owner_pid,started_at) VALUES (?,?,'running',?,?)").run(job, id, process.pid, new Date().toISOString());
    });
  }
  publish(id: string, job: string, snapshot: CodeSnapshot): void {
    const checked = validateSnapshot(snapshot), payload = JSON.stringify(checked);
    if (Buffer.byteLength(payload) > 31 * 1024 * 1024) throw new StorageError("storage_failure", "Analysis exceeds the desktop snapshot budget.");
    this.transaction(() => {
      const owner = this.db.prepare("SELECT id FROM jobs WHERE id=? AND repository_id=? AND state='running' AND owner_pid=?").get(job, id, process.pid);
      const repo = this.repository(id);
      if (!owner || checked.origin.root !== repo.root) throw new StorageError("refresh_conflict", "Refresh ownership was cancelled or replaced; the previous analysis is retained.");
      const now = new Date().toISOString();
      this.db.prepare("INSERT INTO snapshots(repository_id,version,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(repository_id) DO UPDATE SET version=excluded.version,payload=excluded.payload,updated_at=excluded.updated_at").run(id, checked.version, payload, now);
      this.db.prepare("UPDATE jobs SET state='complete',finished_at=? WHERE id=?").run(now, job);
    });
  }
  finish(job: string, state: "failed" | "cancelled" | "interrupted", ownerPid = process.pid): void {
    this.db.prepare("UPDATE jobs SET state=?,finished_at=? WHERE id=? AND state='running' AND owner_pid=?").run(state, new Date().toISOString(), job, ownerPid);
  }
  recover(): void {
    for (const job of this.db.prepare("SELECT id,owner_pid FROM jobs WHERE state='running'").all()) if (!live(Number(job.owner_pid))) this.finish(String(job.id), "interrupted", Number(job.owner_pid));
  }
  forget(id: string): void {
    this.transaction(() => {
      this.recover(); this.repository(id);
      if (this.db.prepare("SELECT id FROM jobs WHERE repository_id=? AND state='running'").get(id)) throw new StorageError("refresh_conflict", "Cancel the active refresh before forgetting this repository.");
      this.db.prepare("DELETE FROM repositories WHERE id=?").run(id);
    });
  }
  settings(initialTheme: "system" | "dark" | "light" = "system"): { theme: "system" | "dark" | "light" } {
    if (!["system", "dark", "light"].includes(initialTheme)) throw new StorageError("storage_failure", "Invalid initial theme.");
    // Import Phase 02's local browser preference once. A stale browser cache
    // can never overwrite a setting already owned by SQLite.
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('theme',?) ON CONFLICT(key) DO NOTHING").run(initialTheme);
    const theme = this.db.prepare("SELECT value FROM settings WHERE key='theme'").get()?.value;
    return { theme: theme === "dark" || theme === "light" ? theme : "system" };
  }
  setTheme(theme: "system" | "dark" | "light"): void {
    if (!["system", "dark", "light"].includes(theme)) throw new StorageError("storage_failure", "Invalid theme setting.");
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('theme',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(theme);
  }
  recordMeasurement(input: MeasurementInput, applicationVersion: string): void {
    const m = validateMeasurement(input), version = validateApplicationVersion(applicationVersion);
    this.db.prepare("INSERT INTO pilot_measurements VALUES (?,?,?,?,?,?)").run(m.category, m.elapsedMs, m.usefulness, m.discovered, m.missed, version);
  }
  measurements(): { records: Measurement[]; total: number } {
    const rows = this.db.prepare("SELECT * FROM pilot_measurements ORDER BY rowid DESC LIMIT 1000").all();
    return { total: Number(this.db.prepare("SELECT COUNT(*) AS n FROM pilot_measurements").get()?.n), records: rows.map((row) => ({
      ...validateMeasurement({ category: row.category, elapsedMs: Number(row.elapsed_ms), usefulness: Number(row.usefulness), discovered: Number(row.discovered), missed: Number(row.missed) }),
      applicationVersion: validateApplicationVersion(row.application_version),
    })) };
  }
  resetMeasurements(): void { this.db.prepare("DELETE FROM pilot_measurements").run(); }
  close(): void { this.db.close(); }
}
