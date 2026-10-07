# FS-05 verification and delivery

Final status: **COMPLETE**. All 39 mandatory gates are individually PASS in
[acceptance.md](acceptance.md). This qualifies a bounded Python language
foundation, with partial static semantics; it does not qualify Django/DRF,
arbitrary Python runtime behavior or whole-language certainty.

| Verification | Final result |
| --- | --- |
| Legacy product + FS-01–05 tests | **262 PASS**, 0 failures, 0 skipped |
| FS-05 controlled suite | **19 PASS** |
| Exact syntax/location oracles | 12 cases each on CPython **3.12.15 / 3.13.16** |
| Controlled semantic qualification | 27 patterns each, repeated deterministic output, exact positive/forbidden calls |
| Missing oracle / wrong version / unknown profile | 3 negative gates PASS; selected unqualified target fails |
| Parent lifecycle/IPC faults and fresh recovery | 12 PASS |
| Actual Windows allocation/OOM/deadline/kill recovery | PASS; bounded commitment, child reaped, fresh parser succeeds |
| Actual extractor node/fact caps | 6 below/at/above PASS; 100,000 nodes and 20,000 facts enforced |
| Missing/corrupt packaged assets | 12 PASS; typed Python refusal, no Python facts, TS/JS usable |
| Next typegen / strict tsc / lint / production build | PASS |
| Rust fmt / check / tests, locked and offline | PASS; 36 application + 2 parser-host tests, one pre-existing ignored test |
| Desktop assets / staged sidecar / native mixed TS/Python launch | PASS |
| Packaged Vite/React and Node/Next preservation | PASS for every inherited selected tuple/profile |
| Packaged Python: offline / empty PATH / no dev tools | PASS, including SQLite reopening and stale evidence |
| Windows cold/warm performance | 5 cold + 20 warm per tuple; no deadline failures |
| Equivalent historical TS/JS comparison | Three repetitions; fresh ratio 0.867, warm ratio 1.068; no repeated >20% regression |
| Accepted-worktree scope / frozen files | PASS; HEAD unchanged, 41 protected UI/AI/Laya files unchanged |

The exact build commands, exit codes and retained logs are in
[evidence/final-results.json](evidence/final-results.json). The complete regression
log is [all-tests-final.log](evidence/all-tests-final.log). The Node commands used
are the same Cartograph-owned tools behind `pnpm test`, typecheck and lint,
without executing inspected application/configuration code. Windows native tests
cover the bundled sidecar launch; no release, installer publication or signing
was performed.

The initial complete run exposed a late stdin `write EOF` event after parser
termination. All child pipe errors are now handled and exit-during-frame failure
has a controlled recovery test. That failed run remains in
[evidence/all-tests-pipe-race-failure.log](evidence/all-tests-pipe-race-failure.log).
A subsequent new test assertion incorrectly used a nonexistent snapshot property;
it was corrected to the existing external-import coverage contract. The failed
log and typecheck diagnostic remain in
[evidence/all-tests-assertion-failure.log](evidence/all-tests-assertion-failure.log)
and [evidence/typecheck-assertion-failure.log](evidence/typecheck-assertion-failure.log).
The final complete rerun passes 262/262, and final strict tsc passes. Initial
baseline failures remain retained and do not stand in for final results.

Controlled fixtures are authoritative. Supplementary validation analyzes Click
8.2.1 commit `d44436997f26cb2890ff3c094352540473c69777` as protected source only:
61 files, 103 import edges, 5,138 declarations, zero verified direct calls and
explicit dynamic/decorator/annotation/binding gaps. Full/incremental output is
equivalent. Commit/archive/license/source inventory hashes are in
[evidence/supplementary.json](evidence/supplementary.json). Click code, imports,
setup, dependencies and configuration were never executed.

Parser architecture is bundled web-tree-sitter **0.25.10**, Python grammar
**0.25.0**, ABI **15**, running on bundled Node **24.19.0** behind the owned Windows
job host. CPython is developer-only oracle tooling; customer analysis has no
Python/pip/virtualenv/compiler dependency. Snapshot schema stays **v3**, migration
rules stay unchanged, and source evidence remains original-byte SHA256 plus
verified UTF-16/byte ranges. Exact Impact semantics and frozen Laya are covered
by regression and preservation evidence.

Known boundaries remain explicit: root-local declared environments only;
module-local static MRO; no runtime path/finder discovery, attribute/descriptor
or dynamic dispatch, monkey patching, reflection execution, arbitrary decorator
return targets or star expansion. Complex binding scopes conservatively suppress
module calls/exports. Defaults/annotations and unsupported literal `__all__`
forms remain gaps. Only strict UTF-8/ASCII encodings are qualified. Other OS/CPU
architectures, Python versions and runtime override profiles remain unqualified.
The worker provides resource containment and application-enforced read authority;
it does not claim an OS filesystem/network sandbox.

There are **no remaining mandatory FS-05 blockers**. The limitations above are
part of the explicit supported static scope, not unverified acceptance gates.
No FS-06 or later semantics, UI changes, Laya changes/retraining, commits or pushes
are included. See [files changed](files-changed.md), [version manifest](support-manifest.json)
and [resource report](resource-budget.md).
