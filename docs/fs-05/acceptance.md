# FS-05 acceptance ledger

Status: **COMPLETE — all 39 mandatory gates PASS**. Qualification is bounded
to the exact versions, profile and partial static semantics in the
[support manifest](support-manifest.json). Unsupported behavior remains explicit.
The authoritative requirements are [FS-05](../specs/fs-05.md), the inherited
implementation plan and accepted FS-00–04 contracts.

| Mandatory gate | Final status | Retained evidence / scope |
| --- | --- | --- |
| Explicit production parser/grammar package approval | PASS | User approval recorded in this session; approved production assets and isolated tools |
| Pinned runtime/grammar ABI, checksums and licenses | PASS | [Readiness inventory](evidence/packaged.json), [packaging](evidence/package-engine-final.log), pinned assets/licenses and ABI 15 |
| No native postinstall build; unchanged TS/JS parser runtime | PASS | Exact dependency installed with --ignore-scripts; [preservation suite](evidence/all-tests-final.log), unchanged ts-morph runtime |
| Shared coordinator and v3 graph/evidence integration | PASS | [19 FS-05 tests](evidence/fs-05-tests-final.log): composed coordinator, neutral parent validation and mixed v3 snapshots |
| Python 3.12.15 syntax/location oracle parity | PASS | [Exact oracles](evidence/syntax-oracles.json): 12 cases on 3.12.15, original locations/names |
| Python 3.13.16 syntax/location oracle parity | PASS | [Exact oracles](evidence/syntax-oracles.json): 12 cases on 3.13.16, original locations/names |
| Qualified modern syntax: generic aliases, async, match | PASS | [Qualification](evidence/qualification.json): generic aliases, async and match syntax; partial type/capture semantics explicit |
| Functions, classes, methods, parameters and declarations | PASS | [Oracles](evidence/syntax-oracles.json) and [fixtures](evidence/qualification.json): declaration kinds/owners/parameters |
| Lexical scopes, shadowing, closures and ownership | PASS | [27 semantic patterns per tuple](evidence/qualification.json) and scoped imported-call homonym tests |
| References and uniquely proven direct calls | PASS | [Exact call/reference assertions](evidence/fs-05-tests-final.log); immutable/imported aliases, no unrelated name matching |
| Local inheritance / supported MRO | PASS | [C3 fixtures](evidence/qualification.json): module-local diamond and conflict; dynamic receivers withheld |
| Decorator registrations/wrappers; no body-target promotion | PASS | [Decorator fixtures](evidence/qualification.json), shared wrapper bindings and forbidden direct-target promotion |
| Absolute/relative imports and package roots | PASS | [Resolver tests](evidence/fs-05-tests-final.log): absolute/relative roots, beyond-top-level negatives, priority imports |
| Namespace packages and supported src layouts | PASS | [Namespace/src tests](evidence/fs-05-tests-final.log): explicit bounded roots, protected project ownership |
| Aliases, re-exports and bounded literal __all__ | PASS | [Alias/re-export tests](evidence/fs-05-tests-final.log), [literal/dynamic __all__ patterns](evidence/qualification.json) |
| External packages, missing stubs and excluded imports distinct | PASS | [Classification tests](evidence/fs-05-tests-final.log): external/missing/missing-stub/excluded; no stub implementation |
| Dynamic dispatch, reflection, mutation and star ambiguity | PASS | [Negative patterns](evidence/qualification.json): mutation/reflection aliases/global/star/decorator/attribute boundaries |
| Original encoded-byte hash and UTF-16 source ranges | PASS | [Position oracles](evidence/syntax-oracles.json), UTF-16/surrogate/BOM/CRLF/ASCII rejection tests |
| Malformed source cannot prove recovered facts | PASS | [Malformed/cookie cases](evidence/syntax-oracles.json): no recovered semantic facts |
| Protected reads, sensitive exclusions, symlinks and root escapes | PASS | [Protected reader tests](evidence/fs-05-tests-final.log): environments/sensitive files/junction/root escape |
| No inspected Python/import/config/setup execution | PASS | [Execution sentinel](evidence/packaged.json), controlled source-only fixtures and public archive analysis |
| One active worker, IPC/node/fact/time resource caps | PASS | [Caps](evidence/extractor-limits.json), [IPC/deadlines](evidence/parent-faults.json), [lease](evidence/fs-05-tests-final.log) |
| Windows job failure refuses Python; TS/JS remains usable | PASS | [Windows assignment tests](evidence/rust-tests-final.log): fail-closed gate/reap; missing-host TS fallback |
| Startup/missing/corrupt resources produce typed diagnostics | PASS | [12 asset failures](evidence/packaged-failures.json), [startup/ABI/invalid IR](evidence/parent-faults.json) |
| Cancellation, kill, OOM, fresh recovery | PASS | [Real job/OOM/kill](evidence/containment.json), [fault recovery](evidence/parent-faults.json), cancellation tests |
| Previous complete generation retained on failure | PASS | [Refresh/reopened/mid-session retention tests](evidence/fs-05-tests-final.log), [invalid-IR retention](evidence/parent-faults.json) |
| Deterministic repeated and full/incremental equivalence | PASS | [Repeated qualification](evidence/qualification.json), full/incremental equivalence and cached cancellation tests |
| Persistence, watching, evidence and staleness compatibility | PASS | [Packaged persistence/staleness](evidence/packaged.json), [watcher and native smoke](evidence/staged-smoke-final.log) |
| Controlled F05/F00-position/F00-resource fixture records | PASS | [F05 qualification](evidence/qualification.json), F00-position/F00-resource manifests and exact limit records |
| Every tuple/profile and missing-oracle failure gate reported | PASS | [Both tuple/profile records](evidence/qualification.json), [negative qualification](evidence/qualification-negative.json) |
| Pinned public Python supplementary validation | PASS | [Click source-only validation](evidence/supplementary.json), exact commit/archive/license/inventory hashes |
| Windows cold/warm resources and equivalent historical comparison | PASS | [Resource report](resource-budget.md): five cold/twenty warm per tuple, same-host historical protocol |
| Complete JS/TS/framework/security regression suite | PASS | [Full regression](evidence/all-tests-final.log): 262 PASS, 0 failures/skips; inherited framework/security/Impact cases |
| Next typegen, strict tsc and lint | PASS | [Build ledger](evidence/final-results.json): Next typegen, strict tsc, lint and build PASS |
| Locked offline Rust/supervision tests | PASS | [Rust](evidence/rust-tests-final.log): 36 application + 2 helper PASS; one pre-existing ignored test; locked/offline checks |
| Staged asset/license closure and installer startup preservation | PASS | [Assets](evidence/assets-final.log), [native mixed startup](evidence/rust-tests-final.log), staged closure and shell smoke |
| Packaged Windows offline, empty PATH, no Python/dev tools | PASS | [Packaged Python](evidence/packaged.json), [negative assets](evidence/packaged-failures.json): denied egress, empty PATH, no dev tools |
| Frozen Laya, optional AI consent and completed UI preservation | PASS | [Accepted-worktree audit](evidence/scope-audit.json): 41 protected files, frozen Laya hash unchanged; AI/UI regressions PASS |
| No FS-06 or later semantics; no commits/pushes | PASS | [Scope audit](evidence/scope-audit.json): unchanged HEAD; no Django/DRF/later-phase semantics or commits/pushes |

Earlier verification failures are retained: late pipe EOF was fixed and qualified
with an exit-during-frame test; a new test assertion was corrected from a
nonexistent snapshot property to external coverage. The clean complete rerun
passes 262/262 tests, and final tsc passes. See [delivery verification](verification.md).
No unsupported semantic boundary is promoted into a verified relationship to
obtain this phase status. No Django/DRF qualification is granted.
