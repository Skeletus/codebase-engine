# Phase 06 — Evidence-backed symbol and behavioral traces

## Objective

Extend the local model with resolved TS/JS symbols/references/direct calls and conservative static handler traces.

## Why this phase exists

File imports and route declarations cannot prove feature execution. A small supported symbol/call subset provides defensible behavioral investigation before attempting general cross-layer flow recovery.

## Starting state

Phase 04 supplies file graph investigations, witnesses, and persistence. Phase 05 may supply optional explanations but is not required. Existing framework extractors identify routes independently of calls.

## Scope

Declaration entities, resolvable references/direct calls, supported route-to-handler bindings, bounded static call traces, and richer local snapshot/evidence handling.

## Required behavior

- Emit declaration entities with snapshot-scoped stable identities and source ranges. Resolve references and direct calls only when the adapter can establish a unique target from permitted static evidence.
- Support straightforward lexical function calls and statically resolvable imported bindings, including supported aliases/re-exports. Member/receiver dispatch is verified only when a unique target is established; ambiguous/runtime dispatch remains unresolved with a reason.
- Keep existing file/import graph projection intact. New symbol evidence must not duplicate or replace file dependency truth incorrectly.
- Bind supported Next.js/NestJS route declarations to actual handler symbols where uniquely provable. Re-exported or computed handlers without sufficient resolution remain gaps. Existing withheld Express routes remain withheld unless a separate specification extends them.
- Trace bounded reachable direct calls from selected handlers, with every step linked to evidence. Show branching/conditional calls as static possibilities, not temporal order or guaranteed execution. Handle recursion and unresolved boundaries explicitly.
- Preserve related-test candidates through verified references/dependencies; file naming or similarity cannot establish TESTS behavior or executed coverage.
- Version changed snapshots and require reanalysis when richer facts are missing. Make old complete file snapshots visibly less capable rather than inventing empty symbol analysis.
- If Phase 05 exists, expose richer approved evidence to explanations through the same package boundary, without expanding consent implicitly.

## Architectural constraints

ts-morph and TypeScript symbol logic remain inside the TS/JS adapter; shared entities/relations/provenance do not expose AST/compiler objects. Generic graph queries remain language-neutral. Required new relationships are limited to resolved references/calls and supported route-handler bindings. No broad schema implementation merely to anticipate other languages. UI traces derive from the same canonical evidence as the graph.

## Data/privacy constraints

All symbol analysis and persistence remains local and follows root/config/exclusion policy. Do not install dependencies, execute configs, invoke builds, or call a provider to resolve targets. Optional explanations obey Phase 05 direct approved transmission. Do not fabricate edges to compensate for missing dependencies or unsupported syntax.

## Explicit non-goals

General request-to-route matching, databases/ORM semantics, queues/events, reflection/DI recovery, runtime tracing, cross-repository flows, all TS/JS dispatch patterns, additional languages, or inferred execution truth.

## Dependencies

Phase 04 and its storage/engine predecessors. Phase 05 is optional and independent. New parser/runtime packages require approval.

## Migration/removal work

Extend validated contracts, evidence storage, and graph projections compatibly. Retain current parser/framework capabilities and their conservative limits. Update wording so dependency traces and static call traces are distinct. Reanalysis replaces incompatible snapshots safely; no cloud migration.

## Verification

Run typecheck, lint, build, parser/engine/storage tests, Rust checks/tests, and desktop smoke checks. Test local/imported direct calls, aliases, re-exports, shadowed names, duplicate symbols, recursion, conditional calls, unresolved receivers, supported handler bindings, skipped targets, missing dependencies, and incompatible snapshots. Negative fixtures must prove ambiguous targets never yield verified calls. Assert every trace step has source provenance and graph membership.

## Manual acceptance check

Select a supported real handler, inspect its declaration/binding, traverse resolved calls, and open each source witness. Inspect a dynamic-dispatch example and see an explicit unresolved boundary. Confirm the original file map and optional explanations still work.

## Completion criteria

Conservative static behavioral traces are useful and verifiable; unsupported dispatch remains visible, file behavior is preserved, and checks pass. Stop before broader framework or runtime-flow extraction.
