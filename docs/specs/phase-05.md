# Phase 05 — Optional direct BYOK explanations

## Objective

Add optional evidence-grounded generative explanations using user-owned credentials sent directly to a configured provider.

## Why this phase exists

Cartograph's explanation UX is useful, but server-owned OpenAI keys, cloud caches, and implicit source transfer do not meet the desktop boundary. The deterministic pilot is already useful without generation.

## Starting state

Phase 04 deterministic implementation and Windows manual acceptance have passed; macOS/Linux qualification and formal pilot trials remain outstanding. The prior Phase 05 OpenAI implementation passed automated checks; live acceptance was paused by the user to add Groq. Local evidence packages and deterministic investigations are available. No external AI is required or silently active. LangSmith and repository cloud persistence are retired.

## Scope

One provider abstraction, OpenAI and Groq BYOK implementations, native credential access, inspectable transmission consent, file/folder/investigation explanations, local caches, and provider failure handling.

## Required behavior

- Configure an optional provider/model and user credential. Support OpenAI and Groq behind native provider adapters without putting wire-format or SDK assumptions into engine/product contracts. Provider selection belongs in Optional AI settings. Additional providers (e.g. Gemini) must be addable through the catalog/adapter boundary without rewriting evidence, consent, caching, citations or explanation rendering.
- Store credentials through secure native storage, never plaintext settings/SQLite or renderer persistence. Fail closed when secure storage is unavailable; store provider/model/key together in separate provider entries. Removing one provider credential disables its subsequent external operations without removing another provider credential. Preserve existing OpenAI entries safely.
- Assemble the smallest bounded evidence package for the selected explanation. Show provider/model and fixed endpoint, files/evidence included, and the actual payload for inspection before explicit approval to send. Changing the payload requires approval of the changed payload; configuration alone does not authorize evidence transfer. Every external request requires fresh single-use explicit approval; no background model-discovery requests. Use a local provider-specific supported-model catalog validated natively against the official APIs. Account access/quota errors remain bounded, never trigger automatic provider fallback.
- Transmit directly to the approved provider endpoint. No product backend relay, repository upload, whole-repository context, or unrelated observability destination.
- Reuse safe explanation rendering, source navigation, and file/folder UX. Support evidence-grounded investigation synthesis without mutating verified entities/edges.
- Validate cited evidence IDs against the supplied package. Reject unsupported references or display generated text as unverified explanation, never as newly established structural facts. Correct prompt completeness claims and expose coverage gaps. Repository text is untrusted prompt content, not authorization for tools or network actions.
- Cache locally using provider, model, prompt version, actual approved input/evidence digest, and provenance. Hash the exact approved metadata request and fixed endpoint; the existing input-only key approach is insufficient if content/provenance differs. Reuse answers only with matching inputs and clearly show cache/freshness status.
- Handle refusal, timeout, rate limit, cancellation, malformed output, revoked credentials, and disconnected network without affecting structural exploration.

## Architectural constraints

Provider contracts express bounded explanation requests, results, cancellation, and errors; no engine dependence on OpenAI. Native credential access and direct-provider transport stay outside renderer capabilities. Explanations never write graph truth. No autonomous tool loop or classification prerequisite. Application/backend endpoints must never receive source-derived context.

## Data/privacy constraints

External AI is off by default. Only approved bounded structural metadata leaves the device, directly to the selected provider. Raw source contents and absolute repository paths must never be transmitted in Phase 05. Secrets, excluded content, credentials, and arbitrary repository instructions are excluded. Redact keys and payloads from logs/errors/telemetry. Cached prompts/answers remain local and obey repository forgetting. Cached use is not permission to send new evidence.

## Explicit non-goals

Anthropic/Gemini/local-model implementation, automatic classification, agent/chat service, repository modification, embeddings, LangSmith replacement, commercial backend, or mandatory AI.

## Dependencies

Phase 04; reuse Phase 03 storage and Phase 02 native boundaries. Provider/credential packages require separate approval. Live provider validation requires a user-supplied key; fake-provider tests must not require one.

## Migration/removal work

Replace remaining server-key/client assumptions and tracing UI with provider-neutral local results. Any provider SDK, if needed, belongs only inside its native adapter; these adapters use the existing native HTTP dependency without requiring new packages. Adapt explanation caches and freshness to local evidence; do not restore GitHub fetches, Supabase roles, or LangSmith.

## Verification

Run normal TypeScript/lint/build, engine tests, Rust checks/tests, and package checks. Use fake-provider tests for exact approved payloads, endpoint restrictions, changed-payload consent, cancellation, malformed references, cache invalidation/provider isolation, Groq wire construction, secure configuration/model validation, independent credential removal, refusals, and no-provider operation. Test secret redaction/native-storage failure/revocation on supported platforms. Assert no backend or tracing endpoint receives derived data. Record live-key validation separately when available.

## Manual acceptance check

Select Groq and configure a key securely (OpenAI remains optional), inspect and approve selected evidence, generate an explanation, follow citations, and inspect cached/stale behavior. Cancel a request, revoke each configured provider independently, disconnect, and continue structural investigation offline. When both are configured, verify provider/model/payload caches never cross-match, switching requires a new preview, and removing Groq does not remove OpenAI. Restart and select each provider to verify its native configuration is preserved. A live OpenAI key is not required to qualify Groq; record provider-specific live validation separately.

## Completion criteria

Optional direct BYOK is explicit, bounded, credential-safe, and grounded; offline intelligence remains intact and required checks pass. Stop before providers beyond OpenAI/Groq or autonomous behavior.
