# Laya navigation 1

Original project-owned System-1 candidate scorer trained from scratch. It is
Laya-inspired in its local goal/state/candidate decision boundary; no external
Laya implementation, pretrained weights or claimed research architecture is used.
No third-party dataset/weight license is required. This document does not grant
a new public redistribution license to the application's original model/data.

## Data and leakage controls

Only purpose-generated TS source fixtures, explicitly authorized by the user.
No customer repository, open-source clone, provider-generated text, source secret,
telemetry or external upload was used. The generator statically parses each
repository through the existing adapter. Temporary source trees are deleted;
generated validated snapshots remain in the ignored local `generated` directory.
Ordinary application analysis never collects training examples.

Seed 20261005; 100 repositories, two independent goals per repository: locate
implementation / locate structurally reachable test. 60 repositories/120 tasks
train, 20/40 development, 20/40 held-out. Repository IDs, seeded names, task IDs,
20 topic words per split, goal phrasing and named generator variants are separate.
Training variants: fork, shared diamond, extra adapter. Development variants:
shared hub and branches. Held-out variants: cycles, deeper mapping layers and
18-way frontiers. Graph motifs and synthetic boilerplate are intentionally shared;
this is not a corpus of independently authored real projects. Generated owners
provide oracle relevance labels; the parser alone provides structural edges.
Positive training pairs prefer target (grade 2) over verified ancestors (1) over
other nodes (0). Ancestor/target labels are never inference inputs.

Four held-out tasks (10%) intentionally hide topic names and are marked unsupported.
They remain in ranking metric denominators; zero hit is zero recall/RR/path efficiency.
No human evidence times are measured or inferred. Generated records/weights and
training trace reproduce exactly under Windows x64 Node 24.19.0. Other runtime/
platform bitwise reproducibility is unqualified.

## Architecture and training

16 bounded features: goal token coverage of full path, filename and folder;
prefix overlap; candidate depth and relative frontier depth; log fan-in/out;
test filename, test-seeking goal and their interactions; witness length;
frontier size; path components; goal token count. Tokens have no word-ID table,
embeddings or pretrained semantics. Absolute roots, raw source, ASTs and credentials
are absent. The local adapter receives relative candidate IDs and canonical witness
IDs; only these numeric features enter the neural network.

16 inputs → 16 tanh units → 1 linear score: 289 Float64 parameters. Pairwise logistic
loss with L2=0.0001; Xavier initialization seed 42; Adam LR 0.003, beta1=0.9,
beta2=0.999, epsilon=1e-8; batches 64, 32 epochs. At most eight shuffled pairs
per deterministic full-traversal decision; opaque examples excluded from fitting
but included in evaluation. 14,539 training pairs, 4,370 development pairs.
Best checkpoint selected solely by development loss, epoch 32. Initial train loss
1.1162802117; selected train loss 0.0280140578, development loss 0.0286540714.
One topology/provenance correctness repair preceded the first held-out evaluation;
no hyperparameters/features/weights were tuned against held-out outcomes.

Training objective is based on [RankNet's pairwise logistic ranking approach](https://www.microsoft.com/en-us/research/publication/learning-to-rank-using-gradient-descent/).
This is an original small implementation, not Microsoft's model/code distribution.

## Frozen results and limitations

See `report.json` for every held-out task at budgets 2/4/8/16/32/64 and all
fallbacks, and `training.json` for complete epoch loss/configuration/hash.
Primary budget K=4, depth=8, same Phase 08 controller for all rankers:

| Ranker | Recall@4 | MRR | Path efficiency, misses zero | Mean nodes to evidence, reached tasks only |
| --- | --- | --- | --- | --- |
| Deterministic | 0 | 0 | 0 | unavailable; 0/40 reached |
| Lexical control | 0.775 | 0.26875 | 0.5375 | 2.968; 31/40 reached |
| Laya | 0.775 | 0.38125 | 0.7625 | 2.065; 31/40 reached |

Laya reaches 31/40 targets: 30 supported-task successes and one chance/generic-test
hit among the four unsupported opaque goals. Six supported tasks fail within
the budget and three opaque goals miss. All remain in metric denominators.
Per-run assessments in the report distinguish these failures from unsupported
goals instead of reusing the generator's optimistic task label.

All inspect four nodes at this budget. Breadth-first traversal spends its tiny
budget on broad entry frontiers; zero baseline hit is not representative of
unbounded deterministic investigation. The lexical control explains much of
the recall benefit; learned ordering improves early ranking, not recall over
lexical control at K=4. Larger budgets and missed/opaque cases are disclosed.
This narrow synthetic qualification is sufficient to enable the bounded option,
not proof of general semantic reasoning or real developer productivity.

All evaluated snapshots and exhaustive Impact results remained byte-identical.
Technical fallback rate 0%; outside-domain/overall fallback 15/160 decisions
(9.375%) at K=4. No attempt is made to invent facts on opaque names. The ranker
will also use baseline after matching branches are exhausted; all-budget rates
are in the report. A score is not a calibrated relevance probability.

Model JSON is 6,115 bytes, pinned SHA-256
`aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513`.
No Python/ONNX/new dependency or separate download. Existing packaged Node runs
a worker with 32MiB old heap, 8MiB young heap, 4MiB stack; V8 limits do not cap
OS RSS. The measured process RSS delta is reported separately. Warm 200-candidate
benchmark (20 warmups, 100 samples): p95 8.13ms round-trip, 5.66ms compute;
cold 103.53ms; incremental RSS about 25.1MiB, peak worker heap about 14.0MiB.
Numbers are observed samples on this Windows host, not cross-machine guarantees.

## Safety and activation

The application chooses a fixed pinned artifact; repositories/renderers cannot
supply paths, scripts, models or inference commands. Strict shape/hash checks,
relative-ID input validation, 200-candidate/4MiB input limits, a 200ms decision
timeout and worker termination bound inference. Preparation has a one-second
watchdog. No network/keys are needed or used. Controller validates every candidate,
finite score and snapshot/context identity and preserves deterministic ties.
Cancellation, timeout, missing/corrupt/unqualified model, invalid scores, stale
inference identity or worker failure cannot change graph facts. Reasons are visible;
reopen/current-snapshot retry recovers from a refreshed UI generation.

macOS/Linux packaging/inference qualification and formal pilot trials remain open.
Installed Windows manual acceptance of this phase remains with the user.
