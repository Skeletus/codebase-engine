# Phase 05 — Optional direct BYOK explanations

## Objective

Add optional evidence-grounded generative explanations using user-owned credentials sent directly to a configured provider.

## Why this phase exists

Cartograph's explanation UX is useful, but server-owned OpenAI keys, cloud caches, and implicit source transfer do not meet the desktop boundary. The deterministic pilot is already useful without generation.

## Starting state

Phase 04 is pilot-ready with local evidence packages and deterministic investigations. No external AI is required or silently active. LangSmith and repository cloud persistence are retired.

## Scope

One provider abstraction, OpenAI BYOK implementation, native credential access, inspectable transmission consent, file/folder/investigation explanations, local caches, and provider failure handling.

## Required behavior

- Configure an optional provider/model and user credential. Implement OpenAI first without putting SDK types or assumptions into engine/product contracts.
- Store credentials through secure native storage, never plaintext settings/SQLite or renderer persistence. Fail closed when secure storage is unavailable; removing credentials disables subsequent external operations.
- Assemble the smallest bounded evidence package for the selected explanation. Show provider/model, files/evidence included, and the actual payload for inspection before explicit approval to send. Changing the payload requires approval of the changed payload; configuration alone does not authorize arbitrary source transfer.
- Transmit directly to the approved provider endpoint. No product backend relay, repository upload, whole-repository context, or unrelated observability destination.
- Reuse safe explanation rendering, source navigation, and file/folder UX. Support evidence-grounded investigation synthesis without mutating verified entities/edges.
- Validate cited evidence IDs against the supplied package. Reject unsupported references or display generated text as unverified explanation, never as newly established structural facts. Correct prompt completeness claims and expose coverage gaps. Repository text is untrusted prompt content, not authorization for tools or network actions.
- Cache locally using provider, model, prompt version, actual approved input/evidence digest, and provenance. Hash the source actually sent; the existing input-only key approach is insufficient if content/provenance differs. Reuse answers only with matching inputs and clearly show cache/freshness status.
- Handle refusal, timeout, rate limit, cancellation, malformed output, revoked credentials, and disconnected network without affecting structural exploration.

## Architectural constraints

Provider contracts express bounded explanation requests, results, cancellation, and errors; no engine dependence on OpenAI. Native credential access and direct-provider transport stay outside renderer capabilities. Explanations never write graph truth. No autonomous tool loop or classification prerequisite. Application/backend endpoints must never receive source-derived context.

## Data/privacy constraints

External AI is off by default. Only approved evidence leaves the device, directly to the configured provider. Secrets, excluded content, credentials, and arbitrary repository instructions are excluded. Redact keys and payloads from logs/errors/telemetry. Cached prompts/answers remain local and obey repository forgetting. Cached use is not permission to send new evidence.

## Explicit non-goals

Anthropic/Gemini/local-model implementation, automatic classification, agent/chat service, repository modification, embeddings, LangSmith replacement, commercial backend, or mandatory AI.

## Dependencies

Phase 04; reuse Phase 03 storage and Phase 02 native boundaries. Provider/credential packages require separate approval. Live provider validation requires a user-supplied key; fake-provider tests must not require one.

## Migration/removal work

Replace remaining server-key/client assumptions and tracing UI with provider-neutral local results. Retain OpenAI SDK only inside its provider adapter. Adapt explanation caches and freshness to local evidence; do not restore GitHub fetches, Supabase roles, or LangSmith.

## Verification

Run normal TypeScript/lint/build, engine tests, Rust checks/tests, and package checks. Use fake-provider tests for exact approved payloads, endpoint restrictions, changed-payload consent, cancellation, malformed references, cache invalidation, refusals, and no-provider operation. Test secret redaction/native-storage failure/revocation on supported platforms. Assert no backend or tracing endpoint receives derived data. Record live-key validation separately when available.

## Manual acceptance check

Configure a key securely, inspect and approve selected evidence, generate an explanation, follow citations, and inspect cached/stale behavior. Cancel a request, revoke credentials, disconnect, and continue structural investigation offline.

## Completion criteria

Optional direct BYOK is explicit, bounded, credential-safe, and grounded; offline intelligence remains intact and required checks pass. Stop before additional providers or autonomous behavior.
