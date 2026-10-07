import { AnalysisCoordinator } from "../coordinator.ts";
import { typescriptDriver } from "./typescript.ts";
import { pythonExtension, type PythonOptions } from "./python.ts";

/** Reuse the accepted TS/JS driver and generic composition; Python adds neutral
 * facts to the same protected inventory and complete publication candidate. */
export function createComposedRefresh(options: PythonOptions) {
  const coordinator = new AnalysisCoordinator(typescriptDriver(), { signal: options.signal });
  const python = pythonExtension(options);
  return {
    analyze: (root: string, full: boolean, progress?: (stage: "parse") => void) => coordinator.analyzeAsync(root, full, [python], progress),
    reset() { coordinator.reset(); python.reset(); },
  };
}
