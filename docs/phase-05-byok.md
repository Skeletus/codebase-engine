# Phase 05 — Optional direct BYOK explanations

Phase 04 implementation and Windows manual acceptance were accepted by the
user, who explicitly authorized proceeding with Phase 05. The outstanding
macOS/Linux pilot qualification and formal pilot trials remain outstanding;
this phase does not qualify the MVP on those platforms.

## Boundaries and limitations

External explanations are optional. A fresh installation has no provider
credential and sends no external requests. Deterministic analysis, SQLite,
search, traces, impact and evidence inspection remain independent of AI.

The native provider catalog implements OpenAI and Groq using fixed HTTPS
endpoints: `https://api.openai.com/v1/chat/completions` and
`https://api.groq.com/openai/v1/chat/completions`. The UI consumes the catalog
and provider-neutral evidence references; native adapters own request/response
formats. Adding a future Gemini adapter does not change evidence packaging,
approval, caches or explanation rendering. Redirects, automatic
retries and environment/system proxies are disabled. The renderer retains its
IPC-only network policy; the parser/engine and storage processes retain denied
network access. No product backend, tracing service or autonomous tools exist.

Configuration uses Windows Credential Manager, macOS Keychain or Linux Secret
Service via the approved `keyring` dependency. The provider, model and key are stored
together in a separate native entry per provider (`openai` / `groq`), not SQLite, browser storage or environment
variables. Native commands never return the credential. Secure storage failure
fails closed; there is no plaintext fallback. Key entry temporarily exists in
the password input and private native configuration IPC, then the input is
cleared. Never paste a key in this document, terminal history or shared logs.
Linux needs an available, unlocked Secret Service daemon on the desktop D-Bus
session; headless sessions without one cannot enable external generation.

Phase 05 transfers **structural metadata only**: selected relative paths,
export names, convention roles, import evidence, route declarations, hashes,
adapter provenance, omission counts and aggregate coverage. It does not send
raw source contents, absolute repository roots, diagnostic expressions,
excluded files or unrestricted questions. Consequently these explanations
cannot explain implementation details absent from that evidence. Sensitive-looking
metadata is rejected; inspect the full payload before deciding to transmit.

Packages contain at most eight files, 24 import relationships, eight route
declarations, 20 exports per file and 6,000 UTF-8 bytes of evidence. The normal
16 KiB private request budget also applies; unusually long/escaped identifiers
can require selecting a smaller scope. Large folders are a disclosed sample,
not a claim that every connection was included. File explanations include a
bounded direct dependency/dependent neighborhood. Investigation explanations
use the supported deterministic query, not general natural-language retrieval.

Preparing reads selected files locally only to verify their snapshot hashes.
The source read for that check is never sent. Stale, deleted, excluded or
unavailable selected evidence blocks preparation/sending until refreshed.
Prepared approvals expire after five minutes, are single-use and belong to the
active snapshot/configuration. Repository changes, provider changes and
cancellation invalidate pending approvals. Sending rechecks the evidence;
changed packages require a new inspection and approval.

The dialog shows the exact HTTP JSON body, endpoint, provider/model, files and
evidence IDs. Authorization headers are excluded from the preview. Only
**Approve this exact payload and send directly to [selected provider]** permits a new
provider request. Configuring a key or viewing a cached answer does not grant
permission to send another package. Provider use may incur charges under the
user's provider account and is subject to that provider's data policy.

Responses are size-limited, plain text and checked against the supplied
evidence IDs. Unsupported citations, malformed output, refusal and incomplete
answers are rejected. All accepted prose is visibly **generated, unverified
interpretation**; an existing citation ID does not prove every sentence.
Explanations do not create entities, edges, roles or structural facts. Citation
buttons navigate to existing file evidence, where source can be rechecked.

SQLite schema 3 adds only a repository-owned explanation cache. Its key
includes provider, model, prompt version and SHA-256 of the exact outgoing
HTTP body plus endpoint, including evidence content/provenance. Only answers
and cache keys are retained; credentials and approved prompt bodies are not
persisted. Cache reuse requires matching input and current source hash checks.
At most 100 answers per repository are retained. **Forget** cascades the cache
alongside that repository's local snapshot; it does not delete repository files
or global provider credentials. Remove each credential separately. Provider
selection stays in memory for the current application session; after restart,
select Groq again to load its stored model. Existing OpenAI entries are retained.
Removal of one credential does not delete another provider's configuration.
Any configuration change cancels active generation and invalidates outstanding
approvals; the next send always requires a new inspection.

Timeouts (10-second connect / 60-second request), rate/quota limits, refusals,
credential rejection, cancellation and cache failures produce bounded errors
without provider payloads/keys. Cancel aborts local transport but cannot retract
bytes already sent or promise reversal of provider processing/billing. An
unsuccessful credential removal disables operations for the current session and
requires unlocking secure storage and retrying removal before treating the
credential as revoked.

## Obtain a Groq key and select a supported model

1. Sign in or create an account at [GroqCloud](https://console.groq.com/).
2. Open [API Keys](https://console.groq.com/keys) in your intended project and
   choose **Create API Key**. Give it an identifying name (e.g. desktop-manual-test).
   Copy it directly into the application's password field; do not paste it into
   a terminal, `.env`, SQLite, source files, screenshots or chat. Delete the key
   in GroqCloud when no longer needed; local removal does not revoke a provider key.
3. Start the desktop application as below. In **Optional AI settings**, select
   **Groq**, choose **`openai/gpt-oss-20b`**, paste the key and **Save securely**.
   Despite the model ID prefix, this is Groq-hosted inference with a Groq key,
   not an OpenAI API account. The native preview must show **Groq** and
   `https://api.groq.com/openai/v1/chat/completions`.
4. Inspect/approve a small file payload only when ready. A model access or quota
   failure is reported without exposing the provider body or key. Check your
   Groq project's model permissions and account limits; the app never buys a
   paid plan or silently switches providers. Free-tier availability/limits are
   controlled by Groq and may change; no paid OpenAI account is required.

The supported-model lists are local and natively enforced. OpenAI offers
`gpt-4.1-mini`, `gpt-4.1`, `gpt-4o-mini`; Groq offers `openai/gpt-oss-20b` and
`openai/gpt-oss-120b`. Arbitrary IDs, endpoints, audio models and tool-running
systems are rejected. No credentials are used for background discovery or
validation calls. Native adapters use bounded JSON-mode completions. Groq omits
OpenAI's unsupported `store` field, uses low reasoning effort and excludes
reasoning from the response. No tools are enabled. Provider retention policy
still applies; excluding `store` is not a promise about provider logging.

Model/API configuration was checked against the official
[Groq API reference](https://console.groq.com/docs/api-reference),
[GPT-OSS 20B model documentation](https://console.groq.com/docs/model/openai/gpt-oss-20b),
[key setup guide](https://console.groq.com/docs/quickstart) and
[rate-limit documentation](https://console.groq.com/docs/rate-limits).
This is not live account validation. Catalog updates require reviewing the
provider documentation and tests; users cannot replace an endpoint with a proxy.

## Automated verification

From `D:\Repositorios Github\cartograph` in PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm lint
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
pnpm desktop:build
pnpm desktop:smoke
pnpm desktop:smoke --release
git diff --check
```

The desktop build runs the production static frontend build and offline asset
verification. Native hosts are required for macOS/Linux checks; Windows results
cannot establish their native storage/runtime behavior. Fake-provider tests
need no key and must not call the real provider. The Windows secure-store test
creates and deletes two synthetic provider entries in a separate test service; it never
reads or changes the application's user credential.

Actual command results are recorded below after verification. Live-key
validation and manual UI acceptance are separate and cannot be inferred from
synthetic tests or compilation.

## Windows manual acceptance

1. From the directory above, run `pnpm start`, or install and launch the current
   Phase 05 Windows package. Close older desktop windows first. No `.env.local`
   or cloud account is required for structural operation. Use this Cartograph
   checkout itself, or a disposable local TS/JS repository for edit/delete tests.
2. Before configuring AI, disconnect network, open/reopen the repository and
   run a dependency/impact investigation. **PASS:** existing offline workflows
   work. Click a selected file's **Explain** tab and **Explain** button.
   **PASS:** preparation is blocked with a configuration message, no upload.
   Close the dialog without sending.
3. Connect when ready for the live test. Click **Optional AI settings**. Select
   **Groq** in Provider and **`openai/gpt-oss-20b`** in Supported model.
   OpenAI is also available with `gpt-4.1-mini`, `gpt-4.1` and `gpt-4o-mini`;
   Groq additionally supports `openai/gpt-oss-120b`. Paste your
   own API key in the password field and click **Save securely**. **PASS:** the
   field clears and native configuration is confirmed. Restart the application
   and reopen settings, selecting Groq again: the model is remembered and the
   key is never revealed. Provider choices do not perform model-discovery calls.
   Pasting an OpenAI key under Groq (or vice versa) must fail validation without
   saving it. Use only your own keys, never share them in the acceptance record.
   If native storage is locked/unavailable, unlock it and retry; failure must
   never save a plaintext key or disable structural exploration.
4. Select a small file in the graph, open **Explain**, and click **Explain**.
   **PASS:** a preview appears before transmission. Inspect the endpoint/model,
   every listed file/evidence ID, omission/coverage counts and full HTTP JSON.
   Confirm no absolute root, raw source, credentials or unrelated content is
   included. **Close without sending**; no generated answer should appear.
5. Prepare again. After inspection, click **Approve this exact payload and send
   directly to Groq**. **PASS for live generation:** an explanation appears. A bounded provider
   error verifies failure handling only; it does not pass live generation.
   A successful explanation is labelled unverified interpretation and
   never alters graph edges or roles. Follow citations to graph/details, choose
   **Evidence**, then **Read / recheck source**. Inspect the verified provenance
   separately from the generated wording. Record live validation outcome,
   application/model version and whether the payload/citations matched; keep
   keys and repository-derived content out of shared records.
6. Select a folded folder and repeat inspection/generation. For a large folder,
   check that omitted file/edge/export counts are explicit. In **Investigations
   / Ask**, obtain an unambiguous supported result, then click **Explain this
   investigation — inspect external payload first**. **PASS:** the selected
   deterministic goal and bounded evidence are included, not invented execution
   flow or a whole-repository prompt.
7. After a successful answer, select another file then return, restart if
   desired, and prepare the same explanation. Choose **Use matching local cache
   — no provider call**. Repeat disconnected. **PASS:** matching cached prose
   can be displayed without transmission while hashes still match. Change the
   model/payload and prepare again: the old cache must not match. Saving a new model requires re-entering its key.
   When OpenAI is also configured, switch Provider
   and prepare the same selection: the Groq answer must not appear as its cache.
   Close the preview; switch back to Groq and prepare again for a new approval.
8. In a disposable repository, prepare an explanation, edit/delete a selected
   file before approving, then try to send. **PASS:** source recheck blocks the
   send; refresh the analysis, inspect the new payload and approve separately.
   After an answer is displayed, later edits do not silently update it: it
   remains snapshot-derived interpretation. Prepare again to verify freshness.
9. Prepare/send again and click **Cancel request** while pending. **PASS:** the
   UI exits the request, stale responses cannot populate it, and another
   structural investigation works. Bytes already transmitted cannot be undone.
   Try generation disconnected: **PASS:** bounded network/timeout error and
   continued offline structural operation. Real refusal/quota cases may not be
   reproducible with a given account; record them as synthetic-test-only unless
   actually observed.
10. Close any approval dialog, open settings, and **Remove credential / disable**.
    **PASS:** subsequent explanation preparation for that provider is disabled;
    offline structure
    works after restart. If both providers were configured, select the other:
    its stored model remains available and its generation still requires approval.
    Repeat cancellation, offline failure and removal for each provider with a
    live key; mark unconfigured providers synthetic-test-only. If removal fails,
    unlock the native store and retry;
    do not report revocation as passed. **Forget** a disposable registered
    repository and reopen it: prior explanation cache must be absent while
    source files remain intact.

**FAIL** if evidence is sent before its approval, the destination can be changed
to an arbitrary backend, a credential is returned/logged/persisted in plaintext,
unsupported citations become verified claims, or offline intelligence depends
on provider success. Repeat native storage/failure/revocation acceptance on
macOS and Linux when corresponding hosts are available.

## Acceptance record

- Multi-provider extension checks passed: `pnpm exec next typegen`,
  `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (46/46), locked Cargo
  check/test (25/25), Rust formatting, `pnpm build`, static/offline asset checks,
  staged/release engine smoke and `git diff --check`.
  Final `pnpm desktop:build` passed and regenerated the Windows x64 MSI and
  NSIS installers with the final provider-neutral UI. Source, staged and release
  evidence-module hashes match. Line-ending warnings were not check failures.
- Windows live-key and manual Phase 05 acceptance: not performed in this session.
- macOS/Linux native storage, packaging and manual acceptance: unavailable here;
  not performed or qualified.
- Phase 04 macOS/Linux qualification and formal pilot trials: still outstanding.
- No Phase 06+ functionality, providers beyond OpenAI/Groq or autonomous behavior.
