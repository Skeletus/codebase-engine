# FS-06 file inventory

Existing production files modified:

- `lib/engine/adapters/composed.ts`: sequential Python/Django composition and reset.
- `lib/engine/adapters/python-worker.ts`: private Django observation operation using the same bounded WASM worker.
- `lib/engine/parser-worker.ts`: typed validation of the additional private operation; default Python operation retained.
- `lib/model/framework.ts`: language-neutral source-context registration/binding identity helpers.
- `lib/model/framework-validate.ts`: validate those identities while continuing to accept legacy identities.

New production files:

- `lib/engine/adapters/django-syntax.ts`: bounded flat observations and original-source validation; no AST in snapshots.
- `lib/engine/adapters/django-literals.ts`: bounded literal interpretation without evaluation/imports.
- `lib/engine/adapters/django-rules.ts`: pinned trusted framework MRO/method metadata.
- `lib/engine/adapters/django-dispatch.ts`: conservative source C3 and method dispatch.
- `lib/engine/adapters/django.ts`: partial framework/config/route/template/declaration extraction.

Acceptance inputs are `tests/framework-support/fs-06.test.ts` and
`tests/fixtures/framework-support/F06-django/sources.json`. The controlled suite
also generates first-party source variants in protected temporary directories.

New `scripts/fs-06-*.ts` files provide opt-in isolated oracles, staged Windows
probes, inherited parser/asset failure checks, preservation checks, measurements,
supplementary source validation and accepted-worktree audits. Inherited harness
copies retain their original controlled inputs and write only FS-06 evidence.
Resumption added `fs-06-django-recovery.ts` for operation-specific cancellation/
fault recovery and `fs-06-rule-metadata.ts` for deterministic pinned metadata
checks. `fs-06-packaged.ts --extended` adds controlled manager/QuerySet, signal,
template and DefaultRouter facts to both exact offline Windows probes.
`fs-06-django-resource.ts` checks private observation bounds and fresh recovery.

Documentation/evidence is under `docs/fs-06/`. `evidence/scope-audit.json` lists
every new file and the five changed accepted production files against the
FS-06 starting inventory, rather than comparing with an obsolete earlier phase
commit. Ignored generated resources and approved isolated tool binaries are
excluded from that source inventory.

No production package manifest/lockfile, UI, AI explanation, Laya artifact,
Rust source/configuration, or accepted FS-00–05 documentation was modified.
The application-owned staged engine and parser host were rebuilt. No commit,
push, installer publication or release was performed.

Continuation adds strict `fs-06-qualify.ts`, rejection checks, packaged matrix/watch qualification, real template/config/route/addition/parser-commit/mixed-project resource probes, shared reservation boundary checks, 507-file measurement, and equivalent historical comparison. The accepted budget decision is implemented only in the new Django extractor. The controlled test suite now has 54 tests and 158 per-pattern cases across two tuples. See the final scope audit for the exact inventory.

`fs-06-performance-investigation.ts` compares the historical TS/JS path against
exact accepted shared-model source bytes in isolated copies, alternating order
and preserving raw timings and exact snapshot equivalence. Its typecheck/lint
and measured investigation pass; production source stays unchanged.
