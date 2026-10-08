# FS-07 resource results — partial qualification

The accepted FS-00 budgets are unchanged. PASS below applies to the stated experiment, not to criterion 24 or whole-phase qualification.

| Experiment | Result | Retained record / limit |
| --- | --- | --- |
| Flow source above 1 MiB | PASS: typed rejection and fresh recovery | evidence/flow-resource-ceilings.json |
| Flow syntax nodes above 100,000 | PASS: no partial verified output | same record |
| Flow facts above 20,000/file | PASS: no partial verified output | same record |
| Route growth across two profiles above 10,000/generation | PASS: prior publication retained and fresh recovery | evidence/route-resource-ceiling.json |
| Actual Flow parser Windows job commitment | PASS: controlled small/500-function/500-component/malformed inputs | evidence/flow-parser-commit.json; 512 MiB ceiling |
| Shared Windows allocation/OOM, deadline kill, reaping and recovery | PASS for application-owned probes | evidence/containment.json |
| Packaged eight-profile five cold/twenty warm sampling | PASS for tested foundation patterns | evidence/packaged-foundation.json |
| Equivalent captured FS-06/current unchanged TS/JS comparison | PASS for controlled corpus | evidence/performance-comparison.json |
| Complete below/at/above read/config/fact/generation/snapshot and IPC ceilings | UNVERIFIED | Still mandatory; no ceiling widened |

Actual worker peak commitment in the retained probe was 60,473,344–78,434,304 bytes. This is Windows job accounting. The recorded parent RSS samples are different measurements and do not establish whole-engine memory ceilings.

The latest historical comparison recorded cold median ratio 0.5043 and warm median ratio 1.0645 (current/accepted); neither exceeds the 20% investigation threshold. Both engines produced the same snapshot hash. This compares the recorded controlled unchanged TS/JS corpus, not every accepted repository or every new RN pattern.

The first concurrent verification attempt reached the unchanged parser startup deadline. Failed logs remain in evidence/regression-resume-concurrent-failed.log and evidence/packaged-resume-concurrent-failed.log. Sequential reruns are separate records; no timeout was relaxed and no failed case was removed.

Fixture/oracle source and output hashes, exact profiles and missing-proof flags remain in each retained record. Complete per-pattern production records, broader corpus comparison and all ceiling matrices are still required before FS-07 completion.
