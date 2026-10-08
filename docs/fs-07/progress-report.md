# FS-07 progress and verification

FS-07 remains incomplete. The [mandatory ledger](acceptance.md) reports every criterion separately: **0 PASS, 6 FAIL, 21 UNVERIFIED**. These are complete-criterion statuses; passing foundation checks do not waive missing framework scope. No complete qualification record or supported badge was issued.

## Implementation

- Protected Metro inventory resolution and independently pinned RN/Expo defaults integrate with the existing TS/JS framework projection. Android/iOS dependencies and assets remain variant-specific.
- Existing React projection supplies component composition, wrapper, event, hook/effect and context facts. The initial RN layer adds literal AppRegistry/provider and Expo root bindings, with native event properties and conservative dynamic/spread negatives.
- Bundled Hermes 0.25.1 and hermes-estree 0.25.1 are integrity-pinned and licensed. The fixed adapter-owned Flow worker shares the existing Python single-worker lease and Windows job launcher. Private ASTs never enter the shared graph.
- Leading Flow pragmas in exact RN tuples defer TS parsing. The composed language session adds validated neutral declarations, local lexical calls, original-position evidence and Metro import dependencies. Imported callable targets and unsupported type/runtime semantics remain explicit boundaries.
- Generic composition adds an optional before-project extension stage; Python/Django ordering remains unchanged. Reused Metro profiles are idempotent across language/framework contributors. Existing snapshot v3 contracts and binding kinds suffice; no schema migration was introduced.

The [changed-file inventory](evidence/changed-files.json) records files added/modified relative to the accepted uncommitted FS-06 starting state, with SHA-256 hashes. The [source/package audit](evidence/package-audit.json) distinguishes intentional extension surfaces from regenerated FS-06 test evidence. The latter does not represent new FS-06 implementation changes. Laya, UI and native implementation sources remain outside the FS-07 changes.

## Verification results

| Verification | Result | Retained evidence |
| --- | --- | --- |
| Complete existing phase suites and FS-01–07 fixtures | PASS: 345 tests, zero failures/skips; 387,932.7 ms | `evidence/regression.log` |
| Focused FS-07 suite | PASS: 29 tests, zero failures/skips | `evidence/fs-07-kernel-tests.log` |
| Typecheck | PASS | `evidence/typecheck.log` |
| Lint | PASS | `evidence/lint.log` |
| Production build | PASS | `evidence/build.log` |
| Desktop static asset/privacy verification | PASS | `evidence/desktop-assets.log` |
| Rebuilt staged Windows engine | PASS | `evidence/package-engine.log` |
| Packaged foundation: four tuples × Android/iOS, empty PATH/denied parent egress | PASS for tested foundation subset | `evidence/packaged-foundation.json` |
| Packaged missing manifest/corrupt manifest/corrupt parser, snapshot preservation/recovery | PASS for these three controlled faults | `evidence/packaged-foundation.json` |
| Runtime closure/licenses and accepted-source audit | PASS outside explicitly listed FS-07 extension surfaces | `evidence/package-audit.json` |
| Sequential locked/offline Rust verification | PASS; includes Windows job-assignment containment tests | `evidence/rust-tests-retry.log` |

Initial Rust verification encountered a Windows executable lock while the regression suite was using parser-host.exe. Its failed log is retained in `evidence/rust-tests.log`; the sequential rerun is recorded separately in `evidence/rust-tests-retry.log`. Final Rust status must be taken from the rerun, not inferred from packaging success.

## Exact tuples and profiles

| Tuple | React / RN | Resolver | Additional exact tooling |
| --- | --- | --- | --- |
| rn83-bare | 19.2.0 / 0.83.10 | Metro 0.83.8 | RN metro-config 0.83.10; Navigation native 7.5.0/native-stack 7.20.0 |
| rn85-bare | 19.2.3 / 0.85.3 | Metro 0.84.6 | RN metro-config 0.85.3; Navigation native 7.5.0/native-stack 7.20.0 |
| expo55 | 19.2.0 / 0.83.10 | @expo/metro 55.1.2 → resolver 0.83.8 | Expo 55.0.31; Router 55.0.18; metro-config 55.0.27 |
| expo56 | 19.2.3 / 0.85.3 | @expo/metro 56.0.2 → resolver 0.84.5 | Expo 56.0.23; Router 56.2.21; metro-config 56.0.19 |

Node runtime is 24.19.0. Mobile profiles are `android-development` and `ios-development`; `flow-static` supplies neutral syntax facts, not a runtime/type inference claim. Navigation/Router package identities are installed oracle tuples, not completed capabilities. No RN Windows, web export or native implementation qualification is claimed.

Packaged synthetic foundation observations were approximately 0.67–1.52 seconds per full-plus-repeat case, 130–148 MiB observed parent RSS, and 47–50 KiB snapshots. These small-case observations are **not** resource-ceiling tests or an equivalent historical performance comparison.

## Remaining required work

Criteria 08 and 14–18 FAIL because platform branch extraction, navigator declarations, nested navigation, Expo routes, linking configuration and native-spec boundary inventory are not implemented. All other criteria remain UNVERIFIED for their complete scope, with precise missing proof listed in the ledger.

Remaining implementation includes bounded common Metro config composition, package export/redirect/import-map semantics, complete ownership/security matrices, Flow imported callable resolution and complete scope/framework semantics. Remaining qualification includes all per-pattern tuples, watch/publication/variant-switch behavior, full cancellation/fault/resource matrices, equivalent historical performance, representative pinned public repositories and complete offline Windows pattern coverage. Native Android/iOS implementation tracing remains out of scope.

No FS-08 work, Laya retraining, inspected repository execution, commit or push was performed.
