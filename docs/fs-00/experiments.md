# FS-00 isolated experiments

All experiments used synthetic strings and existing product fixtures. User approval authorized installing web-tree-sitter and pinned Python/Java/Kotlin/Swift/Objective-C grammar artifacts only in the isolated directory. No production manifest/lockfile changed. Installs used `--ignore-scripts`; parser generation/native builds were not run. Hermes and Babel were already present transitively and were read for comparison. Framework version research fetched primary metadata without installing those frameworks.

## Reproduction and artifact inventory

Run from the repository root with Node 24.19.0. The scripts are stored as `.txt` intentionally so the current TS/JS analyzer does not discover experimental source. The installed experiment directory was removed after capturing [asset checksums, licenses and lock closure](evidence/parser-assets.json). Reprovisioning packages needs the repository's package-install approval; FS-00 approval is limited to its isolated experiment.

Create `docs/fs-00/experiments/generated/<name>` and install each set separately with `npm install --prefix <directory> --ignore-scripts --no-audit --no-fund --save-exact <package@version>`:

| Directory | Package |
| --- | --- |
| runtime | web-tree-sitter@0.25.10 |
| python | tree-sitter-python@0.25.0 |
| java | tree-sitter-java@0.23.5 |
| kotlin | @tree-sitter-grammars/tree-sitter-kotlin@1.1.0 |
| swift | tree-sitter-swift@0.7.1 |
| objc | tree-sitter-objc@3.0.2 |
| kotlin-alternative | tree-sitter-kotlin@0.3.8 (rejected package comparison only) |

A combined install failed peer dependency resolution because the optional native grammar bindings require incompatible Tree-sitter native versions. Isolation solved the experiment without `--force` or `--legacy-peer-deps`; production delivery must package only the approved WASM/JS/license closure, not these experimental optional native installations.

Download the Swift WASM only from [official release 0.7.1](https://github.com/alex-pinkus/tree-sitter-swift/releases/download/0.7.1/tree-sitter-swift.wasm), place it at `generated/swift/tree-sitter-swift.wasm`, and check SHA-256 `e179468b0f3c30c29d8dd8e57c5a79e67812623046cc18fa593f8563795c0b77`. The npm artifact does not contain WASM. The complete other asset hashes are in [parser-assets.json](evidence/parser-assets.json); registry package integrity is retained separately.

In PowerShell:

```powershell
Get-Content docs/fs-00/experiments/parsers.txt -Raw | node
$env:FS00_LANGUAGE = 'python' # repeat java/kotlin/swift/objc, one fresh process each
Get-Content docs/fs-00/experiments/native-fresh.txt -Raw | node
Get-Content docs/fs-00/experiments/windows-containment.txt -Raw | python -I -
Get-Content docs/fs-00/experiments/contracts.txt -Raw | node --input-type=commonjs
```

Containment uses the existing development Python 3.13.3 only to call Windows APIs. It gates the Node child on stdin until job assignment, applies process committed-memory and kill-on-close limits, controls worker V8 flags, forces allocation failure, runs a clean next process and kills a deadline case. This is a feasibility experiment; the Tauri production supervisor is untouched. The experiment's forced short deadline covers process teardown, while separate cooperative cancellation tests cover an active parse.

## Results and limitations

| Experiment | Result | Decision implication |
| --- | --- | --- |
| Python syntax and execution sentinel | Django imports/URL literals, async/match/generic aliases accepted; malformed source marked error; sentinel not executed | WASM feasible; semantics/scoping remain FS-05 work |
| AST positions | CPython column 18 UTF-8 bytes versus web binding column/index 15 UTF-16 on the same Unicode sample | Normalize explicitly per API; no universal byte assumption |
| Native syntax | Java records/basic bridge, ObjC declaration/selector, Swift annotated bridge, multiline Kotlin bridge accepted | Bounded source-local extraction feasible |
| Compact Kotlin | Valid compact semicolon example rejected by selected grammar | Published unsupported-syntax fixture; never use recovery nodes as proof |
| Alternative Kotlin | npm 0.3.8 lacks WASM | Reject for selected portable delivery; no native compiler fallback |
| Incremental/cancel/reset | Each fresh grammar produced equal incremental/full result, cancelled parse returned null, reset parse recovered | Worker/session feasibility; later fact-level parity still required |
| Flow | Babel 7.29.9 classic/enum passed, component/hook failed; Hermes 0.25.1 all four passed, malformed rejected | Hermes selected for qualified syntax subset; no type inference |
| Flow worker | Hermes parsed 1,000 components and original Unicode/CRLF locations under the same Windows job; stress peak commit 55,078,912 bytes; allocation/deadline/recovery cases passed | Selected grammar and controlled flags fit the isolated Windows worker contract |
| Swift default flags | ~980 MiB RSS on larger sample; 512 MiB job eventually failed even after valid output | Printed parse output alone is insufficient; worker exit/status required |
| Controlled Swift flags | 100/1,000 declaration process cases passed; stress peak committed memory 75,694,080 bytes, ~913 ms | 512 MiB job feasible with recorded flags on pinned host |
| Allocation/deadline/recovery | Forced 512 MiB allocation failed; fresh process passed; 10 ms deadline job cleanup passed | Failure containment demonstrated, not a universal parser throughput guarantee |
| Contract decision experiment | v2 round trip passed; current validator rejects v3/null method; BOM/emoji/combining ranges passed | v3 migration needed; UTF-16 original-source convention viable |
| Origin truth table | Unknown mobile origin -> gap, duplicate service -> candidate, method mismatch -> gap, user map -> assumed | Policy validated as decision table; production matcher not implemented |

Raw [initial parser results](evidence/parser-results.json), `parser-*-fresh.json`, [contract results](evidence/contract-results.json), and [final containment](evidence/windows-containment.json) are authoritative. Failed-default/single-compile and exploratory containment records are deliberately retained; the final record supersedes them. The initial contract harness used an invalid Windows ESM path and then an unavailable tsx loader; corrected native Node TypeScript imports use `pathToFileURL` and pass without installing a loader.

No build or runtime oracle was executed for the new Vite/Next/Django/RN tuples. No native compiler was installed/run. No MSIX/MSI/NSIS installer was rebuilt or installed here. These are required later gates rather than evidence invented by FS-00. Package readiness was validated by parsing actual WASM on Windows; whole installer resource closure is FS-05/08/09 acceptance.

The full existing v2 snapshot is retained as `evidence/baseline-snapshot.json.gz` to keep evidence compact. The contract script accepts either regenerated JSON or the retained gzip. To repeat the Flow containment experiment, run `Get-Content docs/fs-00/experiments/flow-containment.txt -Raw | python -I -`; it requires only the existing Hermes package and does not depend on the removed grammar installations.
