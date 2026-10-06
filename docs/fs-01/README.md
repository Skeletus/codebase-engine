# FS-01 completion and qualification report

Status: **complete**, subject to the retained verification ledger below. Scope: shared contracts, compatibility projections, evidence normalization, local retention/publication and minimal diagnostics presentation. No FS-02 or framework-specific development, package installation, Laya modification/retraining, commit or push.

## Implemented

- Canonical snapshot v3 with language-neutral capabilities/qualification records, project language/profile/extractor sets, analysis variants, resources, registrations, multi-site witnesses, bindings, candidates, typed gaps and explicit user assumptions.
- Strict validators, deterministic identities and snapshot-digest inclusion; candidates do not enter import adjacency or exact Impact.
- Separate HTTP versus page/navigation contracts; explicit unknown/dispatch-dependent methods and unsupported matchers; legacy registration-index projection with current handler proof.
- Original UTF-16/UTF-8 position normalization, strict future-adapter decoding and current-source/hash/range evidence checks. Existing TS decoding and behavior remain intact.
- Separate v2 reader and explicit local reanalysis; transactional retention and v3 publication, including bounded per-format recovery copies through existing settings and protection against newer-format overwrite.
- Pinned worker/client snapshot handshake, Windows host v3 acceptance, staged resource metadata, and capability/candidate/gap/witness diagnostics inside the accepted UI.

See [contract and migration policy](contract.md), [phase specification](../specs/fs-01.md), and [fixture record](../../tests/fixtures/framework-support/F01-contract/fixture.json).

## Verification

All **16 final ledger checks passed**: Next type generation, typecheck, lint, production build, 91 existing JavaScript tests, asset verification, Rust formatting/check/tests, parser/map/insight/engine checks, existing pilot benchmark, staged packaged smoke and the 33 new FS-01 tests. Rust: **36 passed, 1 existing opt-in live test ignored**. [Exact commands, timings and logs](evidence/baseline-results.json).

The new suite exercises real v2 round trips, v3 serialization/identity, repeated/full/incremental equality, semantic golden/source/output hashes, file dependency/Impact parity, multi-file evidence, invalid IDs/references/types/ranges/variants/provenance, qualification gates, method/navigation distinctions, Unicode/BOM/CRLF/encoding, handshake pins, cancelled/failed/interrupted/rolled-back migration, backup retention, newer-format protection, forget cascading, and rendered diagnostics/current/stale evidence-button behavior.

[Historical release compatibility](evidence/historical-release-compatibility.json) additionally exercised both real packaged worker generations. Old default -> v2; new pinned -> v3; mismatched/missing pin -> exit 2 before progress/publication. An actual old v2 writer replaced the current row while the retained v3 payload remained recoverable. Existing release resources and installers were not modified. A fresh installer build/install is a later release qualification gate; the existing release smoke cannot be treated as a v3 smoke because that release deliberately remains v2.

Staged smoke passed bundled Node24.19.0, frozen Laya/baseline/fallback/cancellation, watcher/incremental/loss/shutdown, SQLite restart/history/staleness/Impact/static calls, optional approved explanation metadata/digests/cache/forget and no PATH/cloud/repository dependency requirements. Rust native shell-launch tests passed canonical/space-containing paths, private extended Windows database paths and cleared environment behavior.

Current pilot measurements: checkout 124 parsed files, 363 edges, 745,798 source bytes, analysis 8,632 ms/query 2 ms; synthetic 500-file chain analysis 1,288 ms/query 1 ms. These are observations, not throughput guarantees; the checkout changed and timing/cache conditions differ from FS-00. Read limits remain 1 MiB/file, 128 MiB aggregate, 20,000 files, 200,000 entries and depth64. Snapshot/event/request/Laya limits remain unchanged. Per-format retention adds bounded disk copies as documented in the contract.

The initial verification wrapper used the wrong root and failed before checks ran. Its generated logs were removed from that location, and [invocation error ledger](evidence/invocation-error-results.json) was retained. The corrected final ledger is authoritative. Historical handshake experiment assertions were corrected to the existing fail-closed framing behavior (exit2, no response/progress), without changing production behavior to make the experiment pass.

## Backward compatibility and acceptance

| Required criterion | Evidence/result |
| --- | --- |
| New facts validate and open correct current evidence | 33-test suite; multi-site current/stale checks; diagnostics render/action test; staged/native regression |
| Existing files/imports/exact Impact remain equivalent | Existing 91-test suite plus independent parser projection/legacy reach parity |
| Generic algorithms contain no framework AST logic | Shared types/validators/projection remain language-neutral; graph/traversal modules untouched |
| Migration behavior explicit and atomic | Real v2 reader; rollback/cancel/fail/interruption/retention/forget tests; actual old-writer experiment |
| Valid capability claims require completed matching ledger | Qualification positive/negative/Windows and mismatch fixtures; production legacy observations stay partial |
| Privacy/offline/Windows/model/explanations/UI preserved | Staged smoke, Rust tests, accepted surface reuse, [preservation audit](evidence/preservation-results.json) |

Every FS-01 acceptance criterion is satisfied by the recorded checks. No remaining FS-01 blocker is known. Framework support remains planned/unqualified under FS-00; implementing a parser/profile/extractor is outside this phase. Manual installed GUI/MSI/NSIS qualification was not performed or claimed by this shared-contract phase. The existing ignored live provider test remains optional and is independent of local analysis.

## Files changed

The [complete file inventory and source-preservation audit](evidence/preservation-results.json) lists changed/new workspace files. Production areas: engine types/contract/legacy reader/compatibility/TS wrapper/evidence; new model framework/validation/position modules; desktop protocol/projection; storage interface/transactional retention; Windows host/version pin and native launch fixture; existing packaging/smoke scripts; a diagnostics component and its existing parent. Existing test fixtures were updated only for the approved version pin, with the new FS-01 suite and synthetic fixture records added. Root dependency manifests, lockfiles, configuration, Laya sources/artifact and unrelated accepted changes were preserved.

Reproduce with `powershell -File docs/fs-01/verify.ps1 -Run`. Provision existing dependencies/resources through the repository's approved setup before running it; it installs nothing. Recheck historical interop using `Get-Content docs/fs-01/check-historical-release.txt -Raw | node` on this Windows host with the preserved historical release. This experiment is separate from the portable fixture suite.
