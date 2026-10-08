import { djangoExtension, type DjangoOptions } from "./django.ts";
import { AnalysisCoordinator } from "../coordinator.ts";
import { typescriptDriver } from "./typescript.ts";
import { pythonExtension } from "./python.ts";
import { flowExtension } from "./flow.ts";
import type { MetroMode } from "../../parser/adapters/metro-profile.ts";

/** Reuse the accepted TS/JS driver and generic composition; Python adds neutral
 * facts to the same protected inventory and complete publication candidate. */
export function createComposedRefresh(options: DjangoOptions & {metroModes?: readonly MetroMode[]}) {
  const coordinator = new AnalysisCoordinator(typescriptDriver(undefined, undefined, options.metroModes), { signal: options.signal });
  const python = pythonExtension(options);
  const django = djangoExtension(options);
  const flow = flowExtension(options);
  return {
    analyze: (root: string, full: boolean, progress?: (stage: "parse") => void) => coordinator.analyzeAsync(root, full, [flow, python, django], progress),
    reset() { coordinator.reset(); flow.reset(); python.reset(); django.reset(); },
  };
}
