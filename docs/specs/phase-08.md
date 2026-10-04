# Phase 08 — Local ranking boundary and Laya evaluation readiness

## Objective

Prepare a measurable local System-1 ranking boundary and evaluation harness without assuming an available Laya model.

## Why this phase exists

The deterministic pilot must establish useful investigations before a learned ranking component has a concrete problem. Ordering verified next-node candidates under a limited inspection budget is the first proposed measurable problem; it is not structural discovery.

## Starting state

Phases 04 and 06 provide evidence-backed investigations, candidate graphs, and pilot measurements. No Laya artifact, training pipeline, or inference runtime is assumed. Phase 07 is optional.

## Scope

Ranker contract, deterministic controller/fallback, bounded next-node ordering, local evaluation records/metrics, and documentation of future model prerequisites.

## Required behavior

- Define a ranker input containing investigation goal, snapshot/context identity, verified candidate IDs, and supported local features. Outputs contain candidate scores/order only, never entities or relationships.
- Let the deterministic controller validate IDs, finite scores, limits, snapshot identity, ties, cancellation, and timeout. Invalid/unavailable rankers fall back to deterministic ordering visibly without losing structural capability.
- Apply ranking only to prioritization during bounded evidence investigation. It must not suppress authoritative exhaustive impact results, establish feature membership as fact, or convert scores into edge confidence.
- Establish deterministic baseline ordering and supplied test rankers; production default remains deterministic. No download or model runtime is required to finish this phase.
- Provide local evaluation cases with explicitly consented goals, candidate sets, selected steps, relevance judgments, evidence-success assessments, and budgets. Distinguish repository-derived evaluation records from privacy-safe pilot telemetry.
- Measure Recall@K, MRR, inspected nodes, time to evidence, and path efficiency where ground truth supports the metric. State definitions, denominators, tie treatment, and held-out separation. Preserve structural recall and compare against baseline at equivalent budgets.
- Support repeatable replay and local deletion of evaluation records. Record failures and unsupported cases rather than selecting favorable examples.
- Document later work needed for dataset generation/consent, model training, held-out evaluation, artifact/license verification, export, inference technology, local packaging, latency/memory testing, and three-platform validation. Actual integration requires a subsequent artifact-backed specification and measured justification.

## Architectural constraints

Ranker boundary is replaceable and model/runtime neutral. Laya never writes graph edges, changes verified facts, or becomes a parser dependency. Candidate generation and execution remain deterministic. No coupling to unrelated research code, assumed weights, or a particular inference package. Evaluation must separate ranking usefulness from structural correctness.

## Data/privacy constraints

Goals/features/candidates/judgments derived from repositories remain local. No dataset upload, provider/backend relay, source telemetry, model download, or unapproved training. Evaluation collection requires explicit local consent and deletion controls; use synthetic fixtures by default. Credentials are not evaluation features.

## Explicit non-goals

Training, production Laya inference, dataset generation at scale, artifact export, assumed pretrained integration, graph-edge creation, mandatory ranking, new languages, or a research platform.

## Dependencies

Phases 04 and 06. Phase 07 is not required; Phase 05 explanations may consume collected evidence but do not authorize ranker inputs leaving the device. Model/runtime package selection is deferred to an artifact-backed specification.

## Migration/removal work

Extract only the bounded ordering decision from existing deterministic investigation control. Retain baseline traversal and exact graph operations unchanged. Do not remove functioning algorithms to make ranking necessary, and do not add placeholder production model implementation.

## Verification

Run typecheck, lint, build, engine/evaluation tests, Rust checks/tests, and desktop smoke checks. Cover unknown/duplicate candidates, nonfinite scores, stale snapshots, stable ties, cancellation/timeouts, budgets, ranker failures, replay determinism, and deletion/consent. Assert graph contents are byte-equivalent before/after ranking and structural impact is unchanged. Evaluate synthetic cases with known relevance and demonstrate deterministic model-free fallback under denied egress.

## Manual acceptance check

Compare baseline and a supplied test ranker on the same local investigation/budget; inspect reordered candidates, evidence paths, metric definitions, and failure fallback. Disable ranking and confirm all structural workflows still work. Inspect/delete local evaluation records.

## Completion criteria

Local ranker contracts/controller and reproducible evaluation are ready, fallback remains authoritative, and checks pass. No claim that Laya has been trained or integrated is permitted. Stop; actual model work requires its own specification.
