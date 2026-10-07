# FS-05 — Python language foundation

Status: **COMPLETE — all 39 mandatory acceptance gates PASS**.

The accepted FS-04 worktree is preserved in `evidence/starting-inventory.json`.
Production parser and grammar assets, and isolated CPython oracle tooling, were
explicitly approved by the user in this phase. The runtime is pinned to
web-tree-sitter 0.25.10; Python grammar 0.25.0, ABI 15. The packaged application
will use Node/WASM, never the user's Python installation.

The implementation adds an asynchronous language extension to the shared
coordinator while retaining its synchronous TS/JS compatibility entry. Python
facts use the existing behavior, import, resource, profile, variant, capability,
binding and gap contracts. It does not add a separate intelligence graph.

The Windows parser host assigns a 512 MiB process-commit job with kill-on-close
before releasing a bootstrap gate. The child receives only protected source bytes
and logical filenames. WASM resources are verified against pinned checksums.
The parent rechecks neutral outputs and original-byte source positions. This is
resource containment and application-enforced authority, not an OS filesystem or
network sandbox. Production staging, offline packaging and native Tauri shell
launch with a mixed TS/Python fixture pass. No Python installation is required.

See [acceptance](acceptance.md), [support manifest](support-manifest.json) and
[parser evidence](parser-decision-evidence.md). CPython 3.12.15 and 3.13.16 qualify
controlled syntax/location and static patterns under
`static-python-declared-environment`. Exact customer versions/environments are
never inferred from ranges or machine packages; runtime capabilities stay partial
where that evidence is unavailable. No Django/DRF semantics,
Laya modifications, commits, pushes or inspected application execution are part
of this phase.

Static support includes functions/async, classes/methods/parameters, lexical
ownership/closures, immutable aliases, unique local/imported direct calls and
references, literal root-local imports, namespace/src roots, re-export witness
chains, bounded immutable literal `__all__`, decorator wrapper associations and
bounded local C3 MRO. Imports, wrapper bindings and direct calls remain distinct.
MRO stays adapter-owned; class-base references are its existing shared projection.

Module roots default to each protected project root. Additional namespace/src
roots are explicit bounded adapter inputs within that project's authority.
Automatic arbitrary build-backend roots, sys.path, .pth, setup.py, editable-install
hooks and machine-package discovery are unsupported. Missing stubs, missing
implementations, declared external dependencies and exclusions stay distinct.

Attribute/descriptor dispatch, monkey patching, reflection, dynamic imports and
arbitrary decorator-produced targets remain unresolved. Complex loop/lambda/
comprehension/match/with/except binding scopes conservatively suppress affected
module call/export verification. Generic aliases and match are qualified syntax
with partial type/capture semantics. Strict UTF-8/ASCII and optional BOM preserve
original byte hashes and UTF-16 ranges; malformed recovery cannot prove facts.
Python NFKC identifier lookup never normalizes stored source/evidence.

Controlled fixtures are authoritative. Supplementary Click source validation pins
commit `d44436997f26cb2890ff3c094352540473c69777`; its dynamic patterns withhold
calls rather than creating guessed targets. Archive/license/source hashes are
retained. No external dependency installation or inspected code execution occurs.

The desktop sidecar and engine CLI use the composed adapter. Existing synchronous
TS/JS APIs, snapshot v3 and migration rules remain unchanged. Readiness validates
asset inventory/hashes/ABI/budgets; startup and mid-session failures retain previous
complete Python generations. Protected watcher classification preserves its
legacy default and recognizes additional extensions from analyzed adapter files.

Delivery details: [files changed](files-changed.md), [verification](verification.md),
[resource qualification](resource-budget.md).
