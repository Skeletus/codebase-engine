export class AnalysisBoundaryError extends Error {
  readonly reason: "cancelled" | "resource-limit";
  constructor(reason: "cancelled" | "resource-limit") { super(reason); this.reason = reason; }
}

/** Cooperative boundaries complement the existing native process kill boundary. */
export class GenerationBoundary {
  private readonly deadline: number;
  readonly signal?: AbortSignal;
  private readonly now: () => number;
  constructor(signal?: AbortSignal, milliseconds = 120000, now = () => performance.now()) {
    this.signal = signal; this.now = now;
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 120000) throw new Error("Invalid generation budget");
    this.deadline = now() + milliseconds;
  }
  check(): void {
    this.checkCancellation();
    if (this.now() >= this.deadline) throw new AnalysisBoundaryError("resource-limit");
  }
  checkCancellation(): void { if (this.signal?.aborted) throw new AnalysisBoundaryError("cancelled"); }
}
