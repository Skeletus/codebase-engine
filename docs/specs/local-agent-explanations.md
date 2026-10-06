# Installed local-agent explanations — release extension

## Objective

Extend the accepted explanation workflow with installed Codex and Claude Code,
without granting repository access or changing verified structure or Laya.

## Contract

Remote BYOK (OpenAI/Groq) and local agents share evidence assembly, exact preview,
one-use approval, citations, freshness and local caching. Local agents use their
own existing authentication, never application-owned API keys. Detection is local
and does not authenticate or send evidence. Missing/incompatible tools fail closed.
No installation, download, authentication, repository tool loop or automatic fallback
to another explanation provider is authorized.

Native adapters resolve only allowlisted installed executables, never renderer
paths/arguments. Run without a shell, in a new empty temporary directory, with a
minimal environment. Send bounded structural metadata via stdin only after approval.
Disable repository instructions, hooks, skills, plugins, MCP, browser access and
file/command tools using supported controls. Codex additionally uses an explicit
deny-by-default filesystem permission profile, never ordinary unrestricted-read
`read-only` alone. Version numbers are recorded, not allowlisted. Detection inspects supported
options and validates empty-input startup with every required security control.
Codex also verifies effective disabled features and reads its offline bundled
model catalog. Missing controls/config rejection explain the precise missing
capability and fail closed. No weaker fallback is permitted. Authentication,
model/account access, config/capability, process exit, malformed output, timeout
and cancellation failures must be distinguishable without exposing raw stderr.
Only explicit opt-in synthetic account tests may perform live inference outside
the normal one-use UI approval path.
Preserve account authentication paths without reading/copying credentials.
Supervise children with process-tree cleanup, timeouts and bounded pipes.

Preview names the installed agent and warns it may communicate with its vendor.
It is not an offline inference promise. The exact supplied instructions/context
are shown. Source contents and absolute repository paths remain excluded.
Responses require known evidence citations and remain labelled
`Generated explanation — not structural evidence`. No graph write capability.
Cache identity includes provider, qualified CLI identity, fixed model/config,
prompt and exact context; stale evidence or changed executable invalidates approval.

## Verification and stop point

Exercise detection, unavailable/incompatible tools, both machine-readable adapters,
malformed/tool output, unknown citations, bounded pipes, cancellation, timeout and
tree cleanup using local fake executables; no account/network is required by tests.
Run the Phase 01–09 suite, native format/check/tests, static build/assets,
packaged desktop/release smoke and Windows bundles. Live authenticated requests
are manual and require the user's payload approval. Preserve outstanding
macOS/Linux and formal pilot qualification gaps. Stop after this extension.
