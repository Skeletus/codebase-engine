# FS-02 delivery report

Status: **complete**, supported by the retained verification and preservation ledgers below. Scope: discovery, composable analysis infrastructure, public metadata, static configuration and protected profile interfaces. No FS-03 or new framework-specific extraction/resolution semantics.

## Implemented

- A generation coordinator with one protected inventory, driver-owned syntax sessions and shared composition. The registry distinguishes language/framework/extension detection and rejects conflicts/cycles. Existing first-match role/route/exclusion behavior remains authoritative.
- Nearest-root project ownership, nested package/Python/app roots, deduplicated file inventory and bounded first-party workspace membership. Vite + React and RN + Expo detections coexist. Unsupported Python/native files are counted as skipped, never parsed.
- A narrow first-party public metadata service through RepositoryReader, original-byte hashes, source/config witnesses, typed uncertainty, freshness tracking and metadata/topology refresh classification.
- Bounded literal interpretation, immutable constants/property access/concatenation, import-bound syntactic wrappers and explicit unknown branches. Helpers/getters/mutations, cycles and budget failures never supply guessed values.
- Separate Node ESM/CJS, Vite browser/SSR, Metro Android/iOS and Python profile contracts. Outcomes are classified and source hashes/ownership checked. Independent defaults and explicit iOS/SSR/production variants use FS-01 IDs; new profile/runtime capabilities remain partial.

Details and precise limitations: [architecture](architecture.md). [Complete inventory and preservation audit](evidence/preservation-results.json).

## Verification and compatibility

The authoritative [19-check ledger](evidence/baseline-results.json) runs Next type generation/typecheck/lint/build, existing 91 JS tests, rebuilt staged resources/assets, Rust fmt/check/tests, standalone parse/map/insights/engine, pilot benchmark, packaged smoke, 33 FS-01 tests, 36 FS-02 tests and diff whitespace verification. Rust includes one existing opt-in live test that remains ignored. No inspected application/configuration code is executed by the analyzer.

FS-02 assertions cover mixed/nested roots, compatible detection and preserved legacy precedence, workspace junctions/escapes, sensitive/dependency/generated/Python-environment exclusions, malformed/blocked metadata, exact source hashes/ownership, profile separation, literal interpreter positives and negative mutation/getter/helper/env cases, explicit branches, cycles, below/at/above node/dependency/glob limits, in-match cancellation/deadline checks, failed publication retention, metadata/full/incremental equivalence, SQLite reopen/forget and Unicode/current/stale metadata evidence. Fixture/oracle hashes and installed tool tuples are asserted. No independent framework runtime oracle is invoked or claimed: runtime semantics are deferred, not qualified by these infrastructure fixtures.

Snapshot v3, its field schema, exact import/Impact projection, protocol pins and the accepted v2 retention/reanalysis strategy remain intact. The approved metadata-name allowlist expands using existing FS-01 resource contracts. FS-01 tests retain all assertions; their synthetic package witness is replaced instead of duplicated because discovery now supplies it. Existing production UI, graph, Laya, AI/provider/consent and persistence modules are unchanged.

The [retained historical snapshot check](evidence/historical-snapshot-compatibility.json) verifies the actual FS-01 v3 baseline reads as current and round-trips unchanged; the actual FS-00 v2 baseline still requires reanalysis. Historical source freshness is not inferred from schema compatibility.

The initial full run caught two regression failures: discovery replaced the inherited code-file-limit error, and a followed legacy dependency JSON config was incorrectly admitted as a shared first-party resource. Both were fixed at the new discovery boundary; existing assertions were preserved. [First-run ledger](evidence/first-run-results.json), [failure log](evidence/first-run-tests.log). Subsequent infrastructure changes have their own final verification run; the final ledger is authoritative.

Automatic approval review initially rejected application verification as repository execution. The user explicitly approved Cartograph verification tools only, after which verification proceeded. Inspected configurations and application fixtures remained text-only.

## Qualification and resources

The pinned infrastructure tuple is Node 24.19.0, TypeScript 5.9.3, ts-morph 28.0.0 on Windows x64; extractor `fs-02/1`. [Pattern/qualification ledger](qualification.json), [synthetic fixture record](../../tests/fixtures/framework-support/F02-profile/fixture.json), [resource boundary record](../../tests/fixtures/framework-support/F00-resource/fixture.json).

[Resource measurements](evidence/resource-measurements.json) record five fresh syntax sessions and twenty warm incremental runs on the same small synthetic fixture, snapshot size, inputs/counts and sampled RSS. Fresh sessions are not cold processes, sampled RSS is not peak committed memory, and these numbers do not qualify framework throughput. Current checkout/synthetic-chain observations are in [pilot log](evidence/pilot-benchmark.log); changing checkout size and cache/timing conditions preclude a controlled FS-00/01 throughput comparison. Existing read/event/snapshot/model ceilings are unchanged.

## Acceptance and limitations

| Criterion | Verification |
| --- | --- |
| Compatible project types in one generation; no repository execution | Mixed composition, legacy precedence, execution sentinel and getter/mutation tests |
| Protected resolution has classified outcomes and explicit missing proof | Internal/external/excluded/unresolved, hash/owner, duplicate package, deferred profile and witness tests |
| Exclusions, ownership, metadata freshness and resource boundaries | Junction/secret/environment, cycle/budget/cancellation, stability and refresh tests |
| Existing functionality and FS-01 contracts preserved | 91 existing + 33 FS-01 tests, native/staged regressions and preservation audit |
| Exact tuple/oracle/source/output records; no guessed qualification | Hashed synthetic records; all new runtime/framework profiles remain partial/blocked |

FS-03 and subsequent parsers/framework semantics remain unimplemented. Declarative metadata interpretation is deliberately a subset; advanced TOML/requirements/lock/settings syntax is unsupported with a reason. New parser-worker/process memory qualification and fresh installed GUI/MSI/NSIS acceptance belong to the later authorized phases. No package installation, dependency/license change, model modification/retraining, commit, push or release publication occurred.

Every FS-02 acceptance criterion is satisfied by the retained checks. No remaining FS-02 blocker is known; later-phase runtime and installed release qualifications remain unclaimed.

Reproduce: `powershell -File docs/fs-02/verify.ps1 -Run`. Exact fixture filters: `node --test --test-name-pattern "F02-profile" tests/framework-support/fs-02.test.ts` or `"F00-resource"`; Node reports filtered cases explicitly as skipped. The unfiltered ledger covers both. Measurements: `Get-Content docs/fs-02/measure.txt -Raw | node`. Preservation: `Get-Content docs/fs-02/audit.txt -Raw | node`. Provisioning existing dependencies is separate; these commands install nothing.
