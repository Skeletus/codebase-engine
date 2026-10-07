# FS-05 change inventory

The reference is the accepted FS-04 **working tree**, recorded in
[evidence/starting-inventory.json](evidence/starting-inventory.json), rather than
Git HEAD. Accepted earlier-phase uncommitted changes are preserved.

| Existing file | FS-05 change |
| --- | --- |
| `lib/engine/adapters/typescript.ts` | Export the existing driver for composition |
| `lib/engine/coordinator.ts` | Async language-extension coordination without replacing synchronous TS/JS |
| `lib/engine/refresh.ts` | Async publication/cancellation and adapter-aware watcher classification |
| `lib/model/framework-validate.ts` | Match Python generated-directory exclusions |
| `lib/repository/read-policy.ts` | Exclude `__pypackages__` through the protected reader |
| `package.json`, `pnpm-lock.yaml` | Approved exact web-tree-sitter dependency, installed without scripts |
| `scripts/engine.ts`, `scripts/sidecar.ts` | Activate shared composed analysis; sidecar cancellation/ordered requests |
| `scripts/package-engine.ts` | Explicit WASM/runtime/license/helper closure and readiness manifest |
| `src-tauri/Cargo.toml` | Preserve desktop default binary when adding parser host |
| `src-tauri/src/engine_process.rs` | Mixed-language native shell verification fixture |

New production files are `lib/engine/adapters/composed.ts`, `python.ts`,
`python-source.ts`, `python-syntax.ts`, `python-contract.ts`,
`python-module-priority.ts`, `python-worker.ts`, `lib/engine/parser-worker.ts`,
`lib/engine/assets/python/tree-sitter-python.wasm` and its license, and
`src-tauri/src/bin/parser-host.rs`.

New verification files are `tests/framework-support/fs-05.test.ts`, controlled
F05-python/F00-position/F00-resource records, application-owned FS-05 scripts and
fault/containment probes, and this documentation/evidence directory. The exact
added-file inventory is in [scope-audit.json](evidence/scope-audit.json).

Snapshot schema remains **v3**. Python uses existing declarations, relations,
imports, bindings, profiles, variants, capabilities, gaps and hash-bound evidence.
No Python AST crosses IPC or reaches storage/graph/UI algorithms. The adapter's
private neutral syntax contract and parser readiness/internal IPC are new;
existing desktop protocol, snapshot migration and structural Impact semantics
remain unchanged. Local C3 MRO stays private, with class-base references projected
through the shared graph.

No UI, AI consent/explanation or Laya artifact changes are included. No Django,
DRF or later-phase semantics, new Rust dependency, commit or push is included.
