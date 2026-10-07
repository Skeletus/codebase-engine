# FS-03 implementation and qualification record

**Status: FS-03 acceptance complete.** Mandatory gates pass for the named bounded patterns and exact tuples in [the support matrix](support-matrix.md) and [qualification ledger](qualification.json). Aggregate runtime capabilities stay `partial` for behavior outside those patterns; no universal badge is granted. [Unsupported boundaries](limitations.md) remain explicit. FS-04 was not started.

## Implemented architecture

The existing TS/JS syntax session and lexical declarations are reused. A driver-owned projection hook applies the Vite runtime profile, React bindings, and separate React Router extractor after the language-neutral coordinator composes the snapshot. Ephemeral ts-morph ASTs remain inside the TS driver. Discovery collects approved auxiliary paths during its existing protected inventory walk; referenced HTML/assets are read through the existing reader, hashed and accounted for, without executing configuration.

Runtime dependencies, assets, workers, component references, event handlers, wrappers, hooks, context, lifecycle and navigation registrations occupy the additive evidence model. They never enter legacy file-import adjacency. Existing investigations can show an explicit variant's UI entry, component/event bindings, and verified lexical handler calls. An ambiguous runtime resolution can withhold a legacy call from this framework investigation without changing that call's accepted TS semantics or Impact.

Configuration and original-source witnesses accompany facts. Exported aliases retain intermediate barrel witnesses. JSX factory shadowing, reassigned targets, custom resolvers, dynamic inputs and uncertain router ownership prevent promotion into a verified framework target. No rendering, effect scheduling or handler execution is claimed.

The continuation adds qualified literal React-plugin declarations, conditional self-exports, public assets and bounded production inputs; broader context/hook/class/namespace associations and scoped imperative navigation. Parameter/catch-all matching agrees with the pinned Router API. Incomplete or truncated route sets never establish a unique destination. Coincident callback/parameter source positions preserve declaration-kind ownership.

## Snapshot compatibility

Snapshot version stays **3**. New binding kinds are `entry-point`, `module-dependency`, `asset`, `worker`, `hook`, and `wrapper`. Approved auxiliary resources use purpose `framework-input`; binary assets have encoding `binary`, zero text length and one logical line. Original source ranges remain UTF-16 over original bytes, including BOM/CRLF/Unicode. Binary resources cannot masquerade as source text.

Generated repository-wide parse/snapshot verification outputs are retained as lossless gzip artifacts with original/archive hashes in [the artifact record](evidence/snapshot-artifact.json). The verification runner regenerates the raw files when invoked.

Optional `analysis.developmentProxies` records development-only literal prefixes, target origin/base path and identity/prefix/unknown rewrites. It is absent from old snapshots. Proxies never populate deployment assumptions or cross-stack links. Snapshot readers validate its evidence, identity, scope and rewrite-gap references. There is no SQLite migration. The retained accepted FS-02 v3 snapshot round trips canonically; existing v2 retained-payload/reanalysis and rollback tests remain authoritative. Compatibility means this writer/reader reads old data; older application readers are not promised to accept new enum values.

## Verification and reproduction

Run only application-owned verification commands. Synthetic fixture source is data; public checkout configuration/application code is never evaluated.

```powershell
node --test tests/framework-support/fs-03.test.ts
powershell -NoProfile -ExecutionPolicy Bypass -File docs/fs-03/verify.ps1 -Run
powershell -NoProfile -ExecutionPolicy Bypass -File docs/fs-03/measure.ps1
node scripts/fs-03-evidence.ts
node scripts/fs-03-historical.ts
node scripts/fs-03-qualification-runner.ts --all
node scripts/fs-03-supplementary.ts --run
node scripts/fs-03-tooling-manifest.ts
powershell -NoProfile -ExecutionPolicy Bypass -File docs/fs-03/post-verify.ps1
```

Oracle generation is explicitly opt-in and requires the separately approved isolated tool installs under ignored `node_modules/.fs03-experiments`. It compiles controlled inputs using application-owned options, `configFile:false`, disabled environment-file loading and a known collector plugin. It does not execute the fixture application.

```powershell
& node_modules/.fs03-experiments/vite7/node_modules/node/bin/node.exe scripts/fs-03-oracles.mjs --run --tuple=vite7-react18
node scripts/fs-03-oracles.mjs --run --tuple=vite8-react19
node scripts/fs-03-oracles.mjs --run --tuple=vite8-react19 --expanded --profile=ssr-production
node scripts/fs-03-oracles.mjs --run --tuple=vite8-react19 --expanded --profile=browser-production --case=tsconfig-paths
node scripts/fs-03-router-oracle.mjs --run
node scripts/package-engine.ts
node scripts/fs-03-packaged.ts
```

Retained evidence: [verification ledger](evidence/baseline-results.json), [final checks](evidence/post-verification.json), [joint regression/FS-03 tests](evidence/all-tests-final.log), [packaged Windows smoke](evidence/packaged-fs-03.json), [fixture dimensions](evidence/fixture-dimensions.json), [resource samples](evidence/resource-measurements.json), [resource summary](evidence/resource-summary.json), [public repositories](evidence/supplementary-repositories.json), and [preservation audit](evidence/preservation-audit.json). The full verification runner includes existing JS/TS goldens, FS-01/02, Next build/typegen/typecheck/lint, Rust format/check/tests, asset verification, engine/parse/pilot checks, existing storage/watch/Laya/AI smoke, and the new FS-03 packaged smoke. No installer/release was published.

## Changes relative to accepted FS-02

The full verification ledger has 21 passing checks; the FS-03 suite has 50 passing cases, including actual syntax/route stress, active interruption/recovery and transparent component alias investigations. Five explicit profile records cover all approved combinations. [Fixture design](fixture-design.md), [matcher oracle](evidence/router-oracle.json), and [equivalent historical comparison](evidence/historical-performance.json) explain the evidence. Five cold processes/twenty warm sessions per tuple exercise all selected variants; no measurement hit the deadline. The identical retained TS/JS corpus has no repeated >20% median regression.

Modified existing files: `components/behavior-traces.tsx`; `lib/engine/{coordinator,discovery,behavior,index}.ts`; `lib/engine/adapters/typescript.ts`; `lib/model/{framework,framework-validate}.ts`; `lib/parser/{behavior,walk}.ts`.

New production modules: `lib/parser/framework-bindings.ts`, `framework-budget.ts`, and `lib/parser/adapters/{vite,vite-profile,vite-html,vite-proxy,vite-react,vite-react-config,vite-calls,react-router}.ts`. Controlled fixtures/tests and oracle/supplementary/measurement/historical/qualification/packaged scripts support verification. Accepted uncommitted FS-02 changes predate this phase and are not attributed to FS-03.

Production manifests/lockfiles, native source, Laya artifact/training, optional explanation consent/provider behavior and existing UI layout were not changed. The existing behavior panel gained the evidence projection. Nothing was committed or pushed.
