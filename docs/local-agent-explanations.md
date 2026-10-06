# Installed-agent explanations — Windows acceptance and runtime repair

This extension changes explanations only. Laya `laya-nav-1`, deterministic graph
construction, Impact, watching and persistence remain independent. macOS/Linux
qualification and formal pilot trials remain outstanding.

## Providers and capability qualification

OpenAI/Groq remain remote BYOK providers with native keyring credentials and direct
HTTPS requests. Codex/Claude Code are installed local agents using their own
existing authentication. We do not install, download, authenticate either tool,
read/copy their credential files or store agent credentials. A local agent may
contact its vendor and consume account quota; this is not guaranteed offline.

Compatibility is capability-based, not an exact-version allowlist. Native code
records version, inspects noninteractive help and validates all fixed security
arguments/configuration with empty stdin. No evidence or inference prompt is sent
by qualification. Codex verifies each required access feature is effectively
false. Hidden Claude options may be absent from help, so complete empty-input
startup validation is authoritative. Missing flags, ineffective switches, strict
configuration rejection and unsupported no-input startup name the missing
capability and fail closed. There is no weaker security fallback.

Codex selects the highest-priority visible bounded model identifier from its
installed CLI's offline bundled model catalog. The model is shown in preview and
included in cache identity. Catalog output is capped at 1 MiB; explanation stdout
remains capped at 64,000 bytes. Account/model support is checked only after
approval; no second model or provider is silently tried. Claude uses `sonnet`.

Discovery checks absolute PATH directories, the user's `.local/bin`, and global
npm locations. Repository directories are excluded. Windows npm Codex shims are
resolved to the native vendor executable; `.cmd` and `.ps1` are never executed.
Native `claude.exe` is preferred. A supported global Claude npm entry can use its
installed Node executable. Renderer commands accept no executable/cwd/CLI/env
configuration. Detected system/managed configuration or project configuration
above the temporary workspace rejects qualification. Managed/cloud enterprise
policies and macOS/Linux agent isolation remain unqualified.

## Proven Windows failure and repair

The old adapter failed before inference because strict Codex configuration
rejected `tools.view_image=false` as an unknown field. Its supported `view_image`
feature restriction remains disabled; removing that invalid redundant override
relaxes no access boundary. The next failure was the hardcoded `gpt-5.4` model,
which this ChatGPT-backed account rejected. Offline bundled-catalog selection
now chooses `gpt-5.6-sol` on this installation.

Codex also emits nonfatal model-catalog/disabled-Code-Mode startup notices as
`item.type=error`. The decoder used to confuse those with tool operations. Both
Code Mode and its host are now explicitly disabled. Only the narrowly identified
fallback-metadata notice and the exact Code-Mode-host-disabled/fail-closed notice
are accepted as notices. Unknown warnings, real error/turn failure events and
unsupported tool operations still reject the explanation.

Failures now distinguish unsupported capability/configuration (including the
specific rejected field/flag), account/model availability, authentication,
connectivity/quota, process exit code, malformed output, timeout and cancellation.
Raw stdout/stderr failures, prompt echoes and credentials are never surfaced.
Only safe recognized diagnostic categories/identifiers are exposed.

## Context and execution boundaries

Both agents receive only the exact previewed instructions and existing bounded
EvidencePackage: up to eight files, 24 verified imports, eight routes, bounded
exports/symbol/call metadata, evidence IDs, hashes/line witnesses, coverage and
omissions; evidence JSON is capped at 6,000 UTF-8 bytes. No source contents, AST,
absolute repository root, secrets or unrestricted repository question is supplied.
Relative paths are metadata, never file access grants.

Each invocation needs explicit one-use approval. Context goes through private
stdin, not a prompt/source file. Native code creates an empty
`cbi-explanation-<process-id>-<counter>` workspace under TEMP and removes it after
execution. The selected repository is never its cwd or an argument. Environment
is cleared, retaining only absolute OS/authentication-home paths needed by the
installed tool; PATH, NODE_OPTIONS, API keys and engine roots are not inherited.
The app does not read the preserved authentication locations.

Codex uses `exec`, `--json`, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`
and `--strict-config`. Fixed controls disable shell/image/browser/computer tools,
apps/plugins, hooks, host skills, memories, multi-agent and Code Mode. Explicit
permissions deny filesystem-root access, allow read-only access to the empty
workspace, deny command networking and deny approvals. Ordinary `read-only`,
which allows host reads, is not a fallback. Unsupported tool events reject output.

Claude uses print/JSON mode, `--safe-mode`, `--restricted`, empty `--tools`, deny
all tools, empty strict MCP config, empty settings sources, disabled hooks/skills/
Chrome, no session persistence, no permission prompts and one turn. `--bare` is
not used because it discards subscription authentication. No weaker invocation
is attempted if these controls cannot be validated.

Direct native process execution uses no shell; deadline is 60 seconds, stdin is
bounded, stdout is 64,000 bytes and stderr 16,000 bytes. Windows kill-on-close Job
Objects contain the child tree before context is written. Cancellation, deadline
or overflow terminates descendants and cleans the temporary workspace. POSIX
process groups exist but are not yet platform-qualified.

Responses must contain supplied citations, bounded body and no graph-like extra
fields. Unknown IDs/malformed JSON reject. UI identifies provider and labels
`Generated explanation — not structural evidence`. No adapter has a graph-write
API. Provider/model/prompt/payload/CLI identity and adapter revision isolate caches.
Freshness is checked before sending and after generation, even with watching
paused. Replaced executables invalidate pending invocation. Forgetting a repository
removes associated caches. OpenAI/Groq approval, keys and behavior remain separate.

Interfaces were checked against installed help and official documentation:
[Codex noninteractive](https://developers.openai.com/codex/noninteractive),
[Codex configuration](https://developers.openai.com/codex/config-reference), and
[Claude CLI](https://code.claude.com/docs/en/cli-reference).

## Actual live result

The production native adapter was tested against installed `codex-cli 0.151.0`,
logged in using ChatGPT, with catalog model `gpt-5.6-sol`. It returned valid JSON,
body citing `[F1]` and `citations: ["F1"]`. Only synthetic relative `entry.ts`/`entry`
metadata plus an explicit omission was supplied. No real repository evidence,
root or source was sent. Claude is not installed here; live Claude acceptance
remains manual. The live test is opt-in and excluded from the offline suite:

```powershell
Set-Location 'D:\Repositorios Github\cartograph'
# Explicit synthetic account request; may consume vendor quota.
cargo test --manifest-path src-tauri/Cargo.toml live_codex_synthetic_explanation -- --ignored --nocapture
```

## Exact Windows manual acceptance/retest

1. Close old app instances. Open PowerShell and check installed tools only:

   ```powershell
   Set-Location $env:USERPROFILE
   Get-Command codex,claude -ErrorAction SilentlyContinue
   codex --version
   codex login status
   claude --version
   claude auth status
   ```

   Run Claude commands only if installed. Never paste tokens/credentials. Missing
   tools require no application action; no automatic install/login occurs.

2. Start from the Cartograph repository root:

   ```powershell
   Set-Location 'D:\Repositorios Github\cartograph'
   pnpm start
   ```

   Alternatively install the rebuilt MSI/NSIS and launch it. Local agents require
   no application `.env` or BYOK key. Open an analyzed repository; Cartograph itself
   is suitable. Confirm offline graph/Impact functionality first.

3. Open **AI explanations**, choose **Local agents → Codex**. Expect **Available**,
   detected version and catalog model (`gpt-5.6-sol` on the tested installation),
   account/vendor disclosure and no API-key field. Model/version can differ on
   another compatible installation. Claude should show Available with `sonnet`
   when installed/qualified, or Not detected when absent. Incompatibility names
   the missing option/feature/configuration. Selection alone sends no evidence.

4. In **Explore**, select a file, open **Explain**, request an explanation. Inspect
   the entire exact preview: provider/model, instructions, relative paths, IDs,
   hashes, structural metadata, coverage and omissions. No source body or absolute
   repository root may appear. Press **Close without sending**. PASS: no result,
   provider invocation or graph change. Reopen for a new approval.

5. Press **Approve this exact payload and send directly to Codex**. PASS: a cited
   explanation labelled **Generated explanation — not structural evidence** with
   Codex/model identification. Citation buttons open existing evidence. File/edge
   counts remain unchanged. No terminal/permission prompt or repository edits.
   Genuine account/quota/connectivity failures must be bounded and accurately
   classified; they must never disable structural intelligence. The original
   generic login error must not recur for valid configuration/account operation.

6. Repeat the exact selection and choose **Use matching local cache — no provider
   call**. PASS: cached answer, no process/request. Switch provider: PASS requires
   new preview and independent cache identity. Old `gpt-5.4`/old-adapter entries
   must not be reused. Close without sending to confirm switching grants nothing.

7. Prepare a preview, edit an included source file outside the app, then approve.
   PASS: stale evidence blocks or invalidates the request. Refresh before retrying.
   Repeat with watching paused: stale evidence must still block; unchanged valid
   evidence may work. No old graph/current source combination is silently accepted.

8. Start a new request and promptly **Cancel request**. PASS: no late result/cache
   publication; explanation child/descendants exit in Task Manager; unrelated agent
   sessions remain untouched. A hung request must fail within the bounded timeout.
   Cancellation cannot retract already transmitted context.

9. For installed/authenticated Claude Code, repeat steps 3–8 selecting **Claude
   Code**, with its own fresh previews/caches and `sonnet`. An absent tool is **not
   tested**, not passed. Do not bypass missing security controls to qualify it.

10. Disconnect network. Explanations may fail or use cache; no offline generation
    promise is made for these agents. PASS: graph, exact Impact, evidence,
    deterministic Ask and Laya still work. Reconnect and verify OpenAI/Groq retain
    independent secure key settings, exact previews, cancellation and caches.

FAIL includes unauthorized invocation, source/root transmission, unrestricted
file access, unknown accepted citation, graph mutation, stale accepted evidence,
weaker security fallback, missing cleanup or structural functionality dependence
on an agent. Live UI acceptance remains the user's check.

## Automated verification record

- Next type generation, TypeScript and lint: PASS.
- Full Phase 01–09 `pnpm test`: PASS, 90/90.
- Rust format/check/tests: PASS, 36 offline tests; one live test is ignored by
  default and passed separately through the explicit command above.
- Parser/map-counts/insights/engine standalone checks: PASS; 116 parsed files,
  327 relationships, round trip valid, no dangling graph endpoints/cycle witnesses.
- Desktop static build/assets, MSI/NSIS rebuild and desktop/release engine smoke:
  PASS. Windows MSI: 245.31 MiB; NSIS: 234.19 MiB.
- Frozen Laya SHA256 remains
  `aa499934b8197fb12c36eec2b367c523d5a6da77b439ab58dc4b30bb46ea3513`.
- No new dependencies, model changes, commits or pushes.