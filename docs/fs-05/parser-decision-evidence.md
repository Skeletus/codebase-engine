# FS-05 parser qualification

The accepted ADR-00-02 choice is retained: web-tree-sitter 0.25.10,
tree-sitter-python 0.25.0 WASM, ABI 15, inside the existing Node 24.19.0 engine.
The application never obtains a parser or interpreter at startup. The grammar
and runtime checksums match the approved FS-00 artifacts. Production installation
used `--ignore-scripts`; no native npm grammar dependency was added.

CPython is a developer-only syntax/location oracle. The 3.13.16 official Windows
embeddable archive has SHA256
`97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297`.
CPython 3.12.15 was built from the official source archive, SHA256
`de1a241a519e0a3374fea98988d0b52c886743f9d953f23be8269cc7b59c5fab`.
Its Windows build required the separately approved isolated zlib 1.3.1 source
and the standard `unicodedata` extension for non-ASCII identifier qualification.
Build logs and the exact zlib reference are retained under `evidence/`.
The source build's Git-derived display label references the surrounding checkout;
the official source checksum, not that display label, identifies its provenance.

Both exact interpreters run with `-I -S`, parsing only first-party controlled bytes
with `ast.parse`. No inspected module, initializer, setup script or configuration
is imported or executed. CPython columns are UTF-8 byte columns; the oracle maps
them to the original UTF-16 text, preserving BOM and CRLF. Each tuple passes all
12 controlled syntax/location cases. Generic aliases and match are syntax claims;
their full type/capture semantics remain partial.

The parser worker loads approved application assets only after the Rust host
assigns its Windows job. The job limits process commitment to 512 MiB and kills
the child on host close. The child has a 128 MiB JS old-space limit and frozen
WASM compilation flags. The parent validates the bounded neutral output and
every original-source hash/range; syntax trees never enter snapshots or IPC.
This is resource containment with application-enforced read authority, not an
OS filesystem/network sandbox.

Retained evidence covers original-byte positions, exact positive/forbidden call
oracles, local C3 MRO, mutation/decorator boundaries, controlled source/node/fact
limits, startup/file deadlines, IPC limits and fresh recovery. Missing/corrupt
packaged assets refuse Python and preserve TS/JS. Failed Windows assignment reaps
the child before its bootstrap gate. See `acceptance.md` for final phase status.

Reproduce developer oracles explicitly with `node scripts/fs-05-oracles.ts` after
obtaining the approved exact tools in their isolated paths. Run every target with
`node scripts/fs-05-qualification.ts --all`, or filter with
`--tuple=python31215 --profile=static-python-declared-environment`.
Missing/stale oracle records or unknown tuple/profile selections fail qualification.
Normal customer analysis never invokes these scripts.

### Import-priority and mutation experiments

The approved exact Windows interpreters were queried with `-I -S` for
`sys.builtin_module_names` and `_imp._frozen_module_names()`. Only trusted
interpreter metadata was loaded. The inventories are retained in
[evidence/python31215-module-priority.json](evidence/python31215-module-priority.json)
and [evidence/python31316-module-priority.json](evidence/python31316-module-priority.json).
The adapter uses their conservative union to withhold same-named project-module
resolution. These imports are external boundaries, without a verified runtime
implementation target. Version-specific names in the union can conservatively
remain external even on the other tuple. Finder overrides, modified `sys.modules`
and disabling frozen modules are outside the declared static profile.
The CPython [import reference](https://docs.python.org/3.13/reference/import.html)
describes the built-in/frozen finder order and submodule updates to package
attributes. Controlled tests also withhold callable package exports when a
same-named submodule can replace the initializer's attribute.

Reflection primitive aliases, including `from builtins import exec as execute`,
are recognized through bounded static alias chains. They conservatively suppress
module call/export verification. Definition-time default and annotation
expressions remain explicit boundaries rather than being attributed to function
body execution. Bounded literal `__all__` currently accepts nonempty ordinary
single/double quoted strings; escaped/triple-quoted/dynamic forms remain gaps.

The combined regression uncovered a late stdin pipe EOF event after worker
termination. The parent now handles errors on all three child pipes; a controlled
exit-during-frame test verifies typed failure and fresh recovery. The failed run
is retained as `evidence/all-tests-pipe-race-failure.log`.
