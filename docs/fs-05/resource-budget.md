# FS-05 resource qualification

Status: **PASS** on Windows x64, Node 24.19.0, AMD Ryzen 5 3500U.
Profile: `static-python-declared-environment`. Corpus: 28 Python files, 1,456
source bytes, 426 named parser nodes and 143 shared graph facts. Both tuples
use the same controlled 27-pattern fixture plus an empty package initializer.
No measured deadline failures. These are corpus measurements, not worst-case
throughput or a whole-engine memory guarantee.

| Tuple | Run | Samples | Median ms | p95 ms | Parent commit/RSS MiB | Parser commit/RSS MiB |
| --- | --- | --- | --- | --- | --- | --- |
| python31215 | cold | 5 | 768.75 | 887.75 | 108.6 / 116.3 | 72.8 / 68.8 |
| python31215 | warm | 20 | 80.94 | 116.99 | 113.5 / 140.8 | 72.8 / 68.5 |
| python31316 | cold | 5 | 865.77 | 886.62 | 109.6 / 117.9 | 72.3 / 68.8 |
| python31316 | warm | 20 | 102.34 | 148.18 | 114.0 / 141.6 | 72.5 / 68.9 |

Windows counters are sampled using CIM descendant discovery and a 50 ms pause.
They report maximum **observed** commitment and RSS separately for the engine
parent and parser child. Short unsampled peaks may be missed. Warm-process
counters include the initial warmup; retained neutral syntax can avoid spawning
a parser during the twenty measured warm iterations. The actual Windows job
probe independently verifies the hard 512 MiB process-commit ceiling.

The unchanged F02-profile TS/JS corpus was compared on the same host, exact
Node 24.19.0 / TypeScript 5.9.3 / ts-morph 28.0.0 and identical source hash.
Three repetitions each use five fresh syntax sessions in one process and twenty
retained-session runs after warmup, matching the historical protocol.
Current median fresh/warm latency is 22.29 / 18.66 ms versus historical 25.71 / 17.48 ms (ratios 0.867 / 1.068). No repeated median regression above 20%.

The selected ceilings remain unchanged: 1 MiB/source, 128 MiB aggregate protected
reads, 20,000 files, 200,000 entries, depth 64; 31 MiB snapshots; one parser/host
session; 512 MiB Windows commitment, 128 MiB JS old-space; startup 5 s, file 2 s,
generation 120 s; source IPC 1 MiB plus bounded header, output 8 MiB and diagnostics
64 KiB; 20,000 facts and 100,000 named nodes/file. Below/at/above source, output,
diagnostic, node and fact tests, real allocation/OOM/kill and fresh recovery pass.
Overflow never publishes truncated verified facts. Shared inherited read/snapshot
boundaries are covered by FS-01/02 regression tests.

Retained records: [measurements](evidence/resource-measurements.json),
[summary](evidence/resource-summary.json), [historical comparison](evidence/historical-performance.json),
[extractor limits](evidence/extractor-limits.json), [parent faults](evidence/parent-faults.json),
[Windows containment](evidence/containment.json). Reproduce serially after other
verification jobs finish with `powershell -File scripts/fs-05-resources.ps1`.
