# FS-07 implementation decisions

## Metro resolver authority

Keep runtime search separate from the historical TS resolver and exact Impact graph. The new kernel accepts only inventory/package/link data; it cannot read files, execute a resolver callback or load configuration. Discovery integration must supply package links from accepted ownership evidence, never from a matching package name alone. External dependencies remain external boundaries when their implementation is outside authorized inventory.

Pinned resolver source and controlled experiments establish extension-first search: for each configured extension, check platform, native, then plain. Explicit existing filenames win without suffix rewriting. Matched package exports use exact targets, with no platform/native/extension expansion. Density-family records list source assets without claiming a runtime device-density selection.

The kernel currently declines exports arrays, unexported-path fallback, package-import maps and nonlocal/bare redirects. Their production treatment and pattern qualification remain outstanding; a boundary is not evidence of complete Metro support. Default configuration composition is also outstanding. The explicit test context is not a substitute for proving RN/Expo defaults and supported configuration interpretation.

## Separate Expo oracle identity

Each Expo oracle enters through its installed `@expo/metro/metro-resolver` export. The installed 55.1.2 wrapper resolves Metro resolver 0.83.8; 56.0.2 resolves 0.84.5. Bare RN85 uses 0.84.6. Records preserve these identities independently. No result is copied between tuples just because the wrapper currently delegates to a common package name.

## Flow syntax qualification is separate from intelligence qualification

Hermes 0.25.1 ESTree accepts the tested classic/enum/component/hook syntax and reports original UTF-16 offsets in the Unicode fixture. This confirms syntax/location feasibility. It establishes no Flow type inference, scope correctness, runtime dispatch certainty, production cancellation or containment. The eventual adapter must emit bounded neutral graph/evidence facts through the shared architecture, and use the existing supervised single-parser lease. It must not parse customer files in the parent process or replace TS/JS parsing globally.

## Baseline and packaging

The accepted starting state includes uncommitted FS-06. Preserve that complete worktree rather than reconstructing from HEAD. Approved Hermes runtime packages are copied by the existing recursive runtime-dependency packager; its development dependencies and isolated Metro/Expo/RN tools are excluded. Parser manifest validation, missing/corrupt assets, supervised startup and offline Windows analysis are still mandatory unverified work.

## Production composition update

The generic coordinator accepts an explicit before-project extension stage so Flow neutral declarations/resources are present before RN framework projection. Default Python/Django extension order remains unchanged. TS/JS defers identified Flow sources rather than borrowing its grammar. The synchronous TS compatibility API reports those files as skipped with `flow-session-required`; the composed API supplies the supervised parser. The extension validates UTF-8 roundtrips against the original protected source hash, caches by that hash and retains explicit imported-call boundaries. Metro profile registration is idempotent across language/framework composition.

Hermes shares the existing Python worker lease and Windows job launcher; only the fixed application-owned worker entry and checksum-pinned runtime are allowed. No repository module loader, configuration loader or transform runs. Package default oracle evidence is complete for the recorded subset; customer configuration composition and the full framework matrices remain unfinished.

No schema change, retraining, UI redesign, native implementation tracing, FS-08 work, commit or push is part of these additions.
