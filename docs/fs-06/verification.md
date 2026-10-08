# FS-06 final verification

**COMPLETE: 30/30 mandatory criteria PASS.** See [acceptance.md](acceptance.md) for every criterion and the final delivery section below for authoritative logs. Earlier sections retain historical interrupted/contended attempts and are superseded by that final section.

# FS-06 verification

Overall status: **INCOMPLETE**. The individual mandatory gates are in
[acceptance.md](acceptance.md). Passing regression/probes do not qualify missing
framework capabilities.

Developer-only exact oracle command:

```text
node scripts/fs-06-oracles.ts --generate
```

It uses the approved isolated CPython/Django/DRF tool directories, records exact
versions, script/executable/output hashes, and fails when either oracle is
unavailable. Normal customer analysis never invokes it. The libffi 3.4.4
artifact/ref and CPython extension build logs are retained in `evidence/`.
`scripts/fs-06-rule-metadata.ts --tuple=all --profile=static-python-declared-environment`
now checks deterministic MRO/method regeneration for 19 classes on each exact
tuple. `--generate` is opt-in; public re-export aliases remain the fixed reviewed
list. The complete strict capability qualification runner remains open.

Controlled fixtures are authoritative. The public official DRF tutorial was
pinned to `c338449d616f613fdcbfa4ea368cdf163a0f183d`, archive SHA256
`ab941ce577bf913b645041f75c3059f0f8fc154629e9d028935847f26e6e8557`.
Static analysis produced 98 declarations, zero verified lexical calls, zero
framework routes and explicit missing/dynamic/unsupported boundaries. Its
source contains DefaultRouter and HyperlinkedModelSerializer patterns, and
settings/ownership/version evidence is insufficient for qualification. Its
dependency declarations were not rewritten to force the controlled tuples.
No imports/settings/manage/migrations or application code ran. Full/incremental
equivalence passes. See `evidence/supplementary.json`.

The staged Django probes use the bundled Node 24.19.0 and WASM parser behind
the Windows job host, with empty PATH, no resolvable next/react/typescript/pnpm
development packages, and denied parent harness network calls. They check
literal route/method/binding facts, direct calls, exact dependencies, snapshot
round-trip, full/incremental equivalence, SQLite persistence and stale evidence.
The extended probes additionally check standard-manager/QuerySet declarations,
signal connect, literal template include, and path-mode DefaultRouter root/
suffix registrations. They do not cover every mandatory capability or certify
an isolated clean VM.

Inherited parser probes test twelve parent lifecycle/transport failures and
fresh recoveries, allocation/deadline containment, and twelve missing/corrupt
asset cases. Eight Django-operation fault/cancellation/fresh-recovery cases now
pass. Full watch/publication and resource qualification remain open.
Packaged Vite/React and Node/Next preservation harnesses also run against the
staged resources; their evidence is retained under FS-06 without overwriting
accepted earlier-phase records.

Typecheck/lint/build, locked-offline Rust tests and desktop asset checks are
application-owned verification tools approved in this session. They do not
execute inspected application/configuration source. Exact final counts and
results are recorded in the final results section after the retained processes
complete. Earlier logs remain distinguishable from delivery verification.

Snapshot schema remains v3, with no field additions or migration changes.
Original registration/binding identities remain accepted. New source-aware
identities distinguish repeated mounted registrations and bindings without
merging their registration sources. Shared validation still enforces source
ownership, target types, witnesses and variant references. Exact structural
Impact continues to use the accepted import graph.

## Resumed delivery verification — 2026-10-07

| Verification | Final result / retained evidence |
| --- | --- |
| Full sequential regression | 297 PASS, zero failures/skips: 262 accepted baseline + 35 FS-06; `evidence/all-tests-final-resumed.log` |
| Exact isolated oracles | Both exact tuples PASS; `evidence/framework-oracles.json` |
| Generic CBV/APIView table | 15 classes per tuple; source overrides and external-handler boundaries; included in final suite |
| Metadata reproducibility | 19 classes per tuple PASS; `evidence/rule-metadata.json` |
| Typecheck/lint/build | PASS; `typecheck-final.log`, `lint-final.log`, `build-delivery.log` |
| Rust/format/assets | 36 application + 2 host PASS, one pre-existing ignored live-account test; `rust-final-resumed.log`, `rustfmt-resumed.log`, `assets-final.log` |
| Final Windows stage/probes | Bundled Node 24.19.0; both extended tuples PASS with empty PATH and no user Python/dev tooling; `stage-final.log`, `packaged-django52-extended.json`, `packaged-django60-extended.json` |
| Preserved staged frameworks | Vite7/React18, Vite8/React19, Next15/Next16 and Node22/24 preservation probes PASS; `vite-preservation-resumed.log`, `node-preservation-resumed.log` |
| Security/recovery | 12 parent faults, 12 missing/corrupt packaged assets, Windows allocation/deadline recovery, 8 Django-operation faults/cancellation/recoveries PASS |
| Private Django resource probes | Two typed resource refusals and one bounded-expression omission with fresh recovery PASS; `django-resource-probes.json` |
| Small tuple measurements | Five fresh and twenty warm runs each; `resource-measurements.json`; these do not qualify worst-case resource ceilings |
| Equivalent historical comparison | Same F02 fixture/CPU/Node/TS protocol, three repeats: fresh 0.936x, warm 1.127x; no repeated median regression above 20%; `historical-performance.json` |
| Accepted-state audit | Five existing files changed; 41 protected UI/AI/Laya files unchanged; frozen Laya SHA and HEAD unchanged; `scope-audit.json` |

All evidence filenames in the table are under `evidence/`. Earlier interrupted,
contended or failing attempts are retained and are not delivery PASS evidence.
The initial concurrent Rust attempt failed on a Windows parser-host file lock;
the sequential retry passed. An expanded fixture run found duplicate extractor
metadata across settings variants; the implementation was corrected and final
tests passed. Lint/typing failures in new developer scripts/tests were corrected.
The first resource probe expected an expression-size rejection; source inspection
established bounded omission instead, and the corrected probe verifies no
truncated expression is promoted.

At the earlier interruption, FS-06 was incomplete: gate 17 failed and gates
06, 07, 11, 13, 15, 18, 20, 23, 27, 28 and 30 were unverified. These historical
statuses are superseded by the final verification below and the current ledger.
The broad framework capability remains partial; individual static patterns have
their own qualification records.


## Final delivery verification (2026-10-07)

All 30 mandatory criteria PASS. Final quiet regression: 316 PASS / zero FAIL / zero skipped; FS-06: 54 tests. Strict qualification: nine groups and 79 current cases per tuple. The [per-pattern ledger](per-pattern-qualification.md) pins 158 records. Exact tuples are Python 3.12.15 / Django 5.2.18 / DRF 3.16.1 and Python 3.13.16 / Django 6.0.9 / DRF 3.17.2; profile `static-python-declared-environment`.

Final evidence logs: `final-quiet-regression.log`, `final-strict-qualification.log`, `final-typecheck.log`, `final-lint.log`, `final-build.log`, `final-rust-retry.log`, `final-rust-format.log`, `final-assets.log`, `final-parent-faults.log`, `final-containment.log`, `final-assets-failures.log`, `accepted-budget-recovery.log`, `final-framework-budgets.log`, `final-config-deadline.log`, `final-parser-commit.log`, `final-django-resource.log`, `final-qualification-negatives.log`, `final-rule-metadata.log`, `final-packaged52.log`, `final-packaged60.log`, `accepted-budget-packaged52.log`, `accepted-budget-packaged60.log`, `final-vite.log`, `final-node.log`, `final-small-measure.log`, `final-large-corpus.log`, `final-historical.log`. They are retained under evidence/.

The earlier accepted-budget full run had 314 PASS and two parser startup timeouts under competing verification work; focused template tests passed. The final complete suite ran sequentially without competing verification jobs and did not change the inherited five-second startup deadline. The initial Rust attempt encountered a Windows executable lock; its sequential retry passed. Earlier failure/incomplete sections above are historical, superseded by this final section and acceptance.md.

Windows qualification uses the staged application-owned engine/runtime/assets on the actual x64 host, empty PATH and unavailable development packages/system Python with denied parent egress. Both tuples pass 12 controlled tests plus extended SQLite/roundtrip/current-stale probes. It does not claim a clean-VM installer certification or operating-system firewall isolation. No inspected application/configuration runs.

Snapshot v3 has no added fields or migration; source-context identity validation continues accepting legacy IDs. Framework registrations/bindings and ORM/signal declarations remain distinct from lexical calls and observed execution. No FS-07 work, UI/AI/Laya/dependency changes, commits or pushes.

The absolute historical warm timing exceeded 20% both immediately after stress and on recheck; those runs are retained. The required investigation uses three alternating accepted/current TS-path pairs with exact accepted source hashes, identical dependencies/runtime/fixture and snapshot hashes. Current/accepted ratios are 1.027 fresh and 0.891 warm. See `performance-investigation-qualified.log` and `performance-investigation.json`. Criterion 27 PASS means the comparison and investigation are complete, not that all observed timings fall below the threshold.
