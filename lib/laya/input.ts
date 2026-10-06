import type { RankInput } from "../engine/ranking.ts";
export function validateLayaInput(value: unknown): RankInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("input_limit");
  const q = Object.fromEntries(Object.entries(value));
  if (Object.keys(q).sort().join() !== "candidates,contextId,goal,snapshotId" || typeof q.goal !== "string" || q.goal.length > 256 || q.goal.includes("\0") || typeof q.snapshotId !== "string" || !/^[a-f0-9]{64}$/.test(q.snapshotId) || typeof q.contextId !== "string" || !/^[a-f0-9]{64}$/.test(q.contextId) || !Array.isArray(q.candidates) || q.candidates.length > 200 || !q.candidates.length) throw new Error("input_limit");
  const candidates = q.candidates.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("input_limit");
    const c = Object.fromEntries(Object.entries(item));
    if (Object.keys(c).sort().join() !== "depth,fanIn,fanOut,id,witness" || typeof c.id !== "string" || !c.id || c.id.length > 4096 || /[\\:\0]/.test(c.id) || c.id.startsWith("/") || c.id.split("/").some((s) => !s || s === "." || s === "..") || ![c.depth, c.fanIn, c.fanOut].every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 1000000) || Number(c.depth) > 64 || !Array.isArray(c.witness) || c.witness.length > 64 || !c.witness.every((id) => typeof id === "string" && id.length <= 16400)) throw new Error("input_limit");
    return { id: c.id, depth: Number(c.depth), fanIn: Number(c.fanIn), fanOut: Number(c.fanOut), witness: c.witness.map((id) => String(id)) };
  });
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length) throw new Error("input_limit");
  return { goal: q.goal, snapshotId: q.snapshotId, contextId: q.contextId, candidates };
}
