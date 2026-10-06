# FS-00 resource budget

Inherited limits stay unchanged. New limits are selected design ceilings, enforced and qualified in later phases. FS-00 measurements validate parser feasibility and failure containment on this Windows host; they are not worst-case latency or whole-product memory guarantees. A limit hit reports a typed coverage gap and preserves the previous complete generation.

| Area | Limit | Enforcement / failure gate |
| --- | --- | --- |
| Existing repository reads | 1 MiB/file; 128 MiB aggregate; 20,000 files; 200,000 entries; depth 64 | Existing RepositoryReader policy, canonical root and sensitive/generated exclusions remain |
| Existing snapshot / desktop event / request | 31 MiB / 32 MiB / 16 KiB | Existing serialization/protocol validators; no silent increase |
| Existing Laya | 4 MiB input; 200 candidates; depth 64; ordering timeout 1–1,000 ms; desktop rank 200 ms | Frozen features/candidates; deterministic fallback |
| Parser concurrency | 1 new-language parser worker per engine generation; 1 active globally in a host session | FS-05/07/08; cancellation owns child cleanup |
| Parser committed memory | 512 MiB Windows process job; JS old-space 128 MiB | Assign before work; OOM returns resource-limit; fresh worker recovery |
| Parser startup | 5 seconds incl. artifact verification/load | Fail closed as parser-unavailable; TS/JS usable |
| Per-file parsing/extraction | 2 seconds Python/Flow; 5 seconds native; source still <=1 MiB | Parent deadline + cooperative cancellation; discard affected unproven facts |
| Generation new-adapter deadline | 120 seconds additional parser/extractor work | Abort new publication, retain previous complete snapshot; cancellation remains immediate |
| Worker IPC | 1 MiB source payload plus bounded header; <=8 MiB facts response; <=64 KiB diagnostics | Dedicated internal protocol, separate from unchanged desktop messages; no AST transfer |
| Per-file adapter output | 20,000 fact records; 100,000 visited syntax nodes | Coverage gap on overflow; no unique-target claims from truncated candidate sets |
| Static config | recursion 32; 10,000 evaluated nodes; 64 followed local metadata dependencies | No code execution; cycles/dynamic input are gaps |
| Globs | 100 patterns/config; 20,000 authorized matches aggregate | Match selected inventory only; unsupported pattern/truncation explicit |
| Route registrations | 10,000 per generation, additionally bounded by 31 MiB snapshot | Exact registration IDs; overflow coverage, no hidden truncation |
| Request wrapper expansion | max 4 call hops, 32 supported wrapper definitions/project | Literal/default arguments only; unsupported wrapper boundary |
| Cross-stack candidates | 200 per request; 64 rewrite rules/project; 8 rewrite hops; 2 seconds link pass/project | Cycles/overflow/deadline => gap; never promote a truncated singleton |
| Fixtures | <=1 MiB source/file, <=128 MiB scanned corpus for ordinary suites | Separate below/at/above-limit cases; no customer/private training data |

Parser-only samples: Python 28,780 bytes/1,000 functions warmed in roughly 23–28 ms with ~64 MiB RSS; native timing/memory varies materially by grammar. Default Swift stress reached roughly 980 MiB RSS. Controlled worker flags under the Windows 512 MiB committed-memory job parsed 1,000 Swift declarations in a process run of ~913 ms with peak commit 75,694,080 bytes. RSS and committed memory are different measures. The controlled flags and allocation/kill recovery test are in [containment evidence](evidence/windows-containment.json); retain the failed-default logs too.

Hermes under the same controlled Windows job parsed 1,000 component declarations (46,890 bytes) at peak commit 55,078,912 bytes; Unicode/CRLF original offsets, allocation failure, fresh-worker recovery and deadline cleanup passed in [Flow containment](evidence/flow-containment.json). The inherited limits apply to the existing product; new per-file node/fact/deadline ceilings apply to the added adapters and do not retroactively limit accepted TS/JS behavior.

Baseline repository pilot: 117 source files, 678,255 bytes, 330 import edges; analysis 11,481 ms, query 2 ms. Synthetic 500-file chain: analysis 1,848 ms, query 2 ms. These are single observed runs from the existing benchmark, not targets for every machine. [Baseline benchmark log](evidence/pilot-benchmark.log).

Later gates: five cold and twenty warm runs per tuple on recorded Windows x64 hardware/runtime; report median/p95, peak commit/RSS separately, fixture bytes/node/fact counts and deadline hits. Compare the unchanged TS/JS corpus with this baseline on the same host; investigate >20% median regression with repeat measurements, without interpreting noisy one-off numbers as failure. Functional hard limits, cancellation, recovery and exclusion behavior are release blockers regardless of average throughput. No hard whole-engine memory claim is introduced without measurement.
