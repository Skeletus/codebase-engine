import { validateLegacySnapshot } from './legacy-contract.ts';
import { validateAnalysis } from '../model/framework-validate.ts';
import { SNAPSHOT_VERSION, type CodeSnapshot, type LegacySnapshot } from './types.ts';

export { validateLegacySnapshot } from './legacy-contract.ts';
/** Current publication accepts v3 only. Historical readers never manufacture v3 facts. */
export function validateSnapshot(value: unknown): CodeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected snapshot object');
  const raw = value as Record<string, unknown>;
  if (raw.version !== SNAPSHOT_VERSION) throw new Error('Unsupported snapshot version: ' + String(raw.version));
  if (Object.keys(raw).some(key => !['version', 'origin', 'adapter', 'projects', 'files', 'relationships', 'routes', 'coverage', 'diagnostics', 'behavior', 'analysis'].includes(key))) throw new Error('Unknown snapshot field');
  const { analysis, ...content } = raw;
  const base = validateLegacySnapshot({ ...content, version: 2 });
  return { ...base, version: SNAPSHOT_VERSION, analysis: validateAnalysis(analysis, base) };
}
export function inspectSnapshot(value: unknown): { state: 'current'; snapshot: CodeSnapshot } | { state: 'reanalysis-required'; snapshot: LegacySnapshot } {
  if (value && typeof value === 'object' && 'version' in value && value.version === 2) return { state: 'reanalysis-required', snapshot: validateLegacySnapshot(value) };
  return { state: 'current', snapshot: validateSnapshot(value) };
}
export function serializeSnapshot(snapshot: CodeSnapshot): string { return JSON.stringify(validateSnapshot(snapshot), null, 2) + '\n'; }
export function deserializeSnapshot(text: string): CodeSnapshot { return validateSnapshot(JSON.parse(text)); }
