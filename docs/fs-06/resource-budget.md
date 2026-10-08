# FS-06 resource verification

Status: **PASS** for the declared ceilings and recorded controlled measurements. No inherited budget was widened.

## Continuation evidence

`evidence/framework-budget-probes.json` verifies 63/64/65 template roots,
19,999/20,000/20,001 tags, and 63/64/65 block/include depth. Above-limit cases
refuse publication; an independent fresh generation recovers.
`evidence/config-deadline-probes.json` verifies named-setting recursion 31/32/33
and the existing trusted 120-second generation clock at entry and during
extraction. Over-depth settings retain a dynamic gap without truncated proof.

`evidence/django-parser-commit.json` measures the actual WASM Django worker:
peak Windows job commitment 75,407,360 bytes (small), 90,451,968 bytes (500 model
declarations) and 75,218,944 bytes (malformed), below 536,870,912 bytes. Its
first-party wrapper exits after the real parser response so host accounting
completes; it never replaces extraction.

`evidence/large-corpus.json` retains five fresh and twenty warm runs per tuple
for 507 files / 500 models. Fresh/warm medians were 7,077/4,552 ms for django52
and 7,211/4,043 ms for django60. Snapshots were about 5.13 MB with equivalent
full/incremental facts. Maximum **sampled parent RSS** was 473,104,384 /
545,484,800 bytes. RSS samples are not peak commitment or a whole-engine ceiling.

`evidence/expansion-budget-probes.json` verifies typed refusal and fresh recovery
for 9,999 / 10,000 / 10,100 requested routes and 36,000 source callback
associations. Combined limits can refuse below the route quota. These probes
record the actual discarded-generation counters: 9,999 and 10,000 registrations
are reached; the 10,001st is refused. The stricter 31 MiB snapshot ceiling
prevents publication of these expanded graphs. This is counter qualification,
not a claim that every graph below the registration quota fits the snapshot.

The user approved reusing the accepted shared reservation budget (20,000 new
facts/file; 200,000/generation) while applying the Django binding ceiling to
20,000 **added** bindings. Inherited TS/JS/Python bindings are outside this
additional ceiling. `evidence/shared-fact-budgets.json` qualifies the reservation
API below/at/above both shared ceilings; these reservations are not graph facts.
`evidence/binding-boundary.json` uses real source to reach 19,999/20,000 added
bindings and refuses the 20,001st, distinguishing snapshot refusal and recovery.
`evidence/mixed-budget.json` preserves all 20,008 accepted TS/Python bindings,
adds two Django bindings, and verifies unchanged behavior/relationships and
SQLite publication within the snapshot limit. No budget was enlarged.

The following sections retain historical measurements and their narrower claims;
final machine-readable records above take precedence over earlier attempts.

The protected reader retains the 1 MiB/file, 128 MiB aggregate, 20,000 file,
200,000 directory-entry and depth-64 limits. The parser retains the globally
serialized owned worker, 512 MiB Windows job commitment, 128 MiB JS old space,
5 s startup, 2 s/file, bounded transport/output and validated original-source
positions. The Django extension uses the same reader and worker lifecycle.

Added bounded processing uses 100,000 visited parser nodes, 20,000 private
observations, 200 arguments per observation, 4,096-character observation text,
depth-32 literal/settings interpretation, depth-64 includes/MRO/templates,
64 template roots, 20,000 template tags, a 120 s generation deadline,
10,000 registrations, 20,000 Django-added bindings and a 31 MiB snapshot refusal.
Shared new-fact reservations retain 20,000/file and 200,000/generation.

`evidence/resource-measurements.json` records five fresh engine sessions and
twenty warm incremental runs on the same small literal corpus per tuple,
including elapsed time, file/registration counts, snapshot bytes and fixture
hashes. Final small-corpus medians are 1670.85 ms fresh / 57.57 ms warm for
django52 and 844.06 ms fresh / 39.66 ms warm for django60. Snapshots are 84,300
and 84,298 bytes respectively (seven files, four registrations). These do not
measure worst-case parent/worker commitment, larger project throughput or cold
OS/runtime startup.

`evidence/historical-performance.json` repeats the exact F02-profile source,
CPU/Node/TypeScript/ts-morph versions and five-fresh/twenty-warm protocol three
times. Repeated median ratios are 0.936 fresh and 1.127 warm, below the 20%
investigation threshold. This is a retained small TS/JS corpus comparison,
not a Django throughput baseline or a repository-wide claim.

`evidence/django-resource-probes.json` verifies node/observation and argument
resource refusals plus fresh recovery. Expressions longer than 4,096 characters
yield empty bounded observation text; they are not truncated into supported
literals. Framework settings without a usable literal retain dynamic gaps.

Inherited containment probes pass Windows allocation refusal/deadline killing
and fresh recovery. The job is process/resource containment, not an OS
filesystem/network sandbox. The packaged probe denies parent harness egress
and removes PATH/development package resolution; it does not certify an
air-gapped clean Windows virtual machine.

The earlier baseline left larger-fixture, commitment and generation ceilings open. The final records above close these controlled qualification gates; eight Django operation fault/cancellation/recovery cases pass. No hard whole-product memory or worst-case latency guarantee is introduced.


## Final measurement authority

The final sequential records are `resource-measurements.json`, `large-corpus.json` and `historical-performance.json`, produced after the final code change without competing verification jobs. They contain all five fresh/twenty warm samples per tuple and repeated equivalent TS/JS comparison. Earlier numeric observations in this document are historical; use these final records for median/p95. Worker commitment is separately measured by `django-parser-commit.json`; sampled parent RSS is not a hard whole-engine limit. Qualification resources report elapsed fixture/assertion time rather than claiming guaranteed latency. All inherited hard limits and refusal/recovery behavior remain intact.


Final summary: [performance-summary.json](evidence/performance-summary.json).

| Tuple | Small fresh / warm median (ms) | 507-file fresh / warm median (ms) |
| --- | --- | --- |
| django52 | 1308.64 / 78.72 | 9109.21 / 5867.64 |
| django60 | 1217.77 / 78.47 | 9649.52 / 7317.50 |

Equivalent historical TS/JS recheck ratios: 1.073 fresh / 1.317 warm. Warm timing exceeds the unchanged 1.20 investigation threshold. The post-stress run (1.199 / 1.444) and recheck are retained in historical-performance-post-stress.json and historical-performance-recheck.json. FS-00 requires investigation, rather than a universal latency guarantee.

The isolated alternating accepted-FS05/current TS-path comparison reproduces the exact fixture/runtime/dependency bytes and restores reachable shared-model files to their accepted starting hashes. Each child repeats five fresh/twenty warm measurements three times, across three alternating pairs. Exact snapshot hashes match; median current/accepted ratios are 1.027 fresh / 0.891 warm. This resolves attribution on this unchanged corpus without widening a budget or changing production code. See [investigation](evidence/performance-investigation.json). It does not qualify unrelated Django throughput or promise worst-case latency.
