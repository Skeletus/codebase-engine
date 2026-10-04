# Phase 01 local engine

Run `pnpm engine <directory>` independently of the web application. Optional
`--out <snapshot>` and `--read <snapshot>` exercise validated versioned snapshots.
The application owns adapters; repositories cannot register or execute adapters.
The engine has no network, provider, identity or persistence dependency.

Contracts retain file dependency evidence, first-occurrence locations, hashes,
type-only status, framework declarations and complete coverage diagnostics.
Dependency reachability is structural evidence, not execution flow. ASTs stay
inside the TypeScript/JavaScript adapter. Evidence reads reject changed hashes
and return unavailable when the repository is missing or inaccessible.

One reader governs traversal, resolution, configuration inheritance and evidence.
It permits only the canonical selected root and rejects symlinks beneath it,
including workspace/dependency links. This deliberately limits linked workspaces.
JSON dependency metadata inside the root is permitted for static resolution;
dependency source is excluded. Incomplete configuration never supplies guessed
resolution results. Configuration modules and repository scripts are never run.

Excluded directories (case insensitive): `node_modules`, `dist`, `build`, `out`,
`coverage`, `target`, `bin`, `obj`, `vendor`, `generated`, `__generated__`, all
dot-directories and sensitive-name directories. Sensitive names include `.env`
and `.env.*`, `credentials`/`secret`/`secrets` and their dotted variants,
`id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519` and dotted variants, and files ending
in `.pem`, `.key`, `.p12`, `.pfx`, `.keystore`. Existing declaration/binary skips
and adapter-specific generated exclusions remain visible in coverage.

Default limits: 1 MiB per file, 128 MiB aggregate read bytes, 20,000 code-file
candidates, 200,000 enumerated entries and depth 64. Oversized sources are skipped;
exhausted budgets and unreadable directories fail explicitly. Reads use bounded
buffers and check file identity; this is static-analysis policy, not an OS sandbox.

`pnpm test` covers contracts, parser parity, policies, graph queries, import
boundaries and existing parser/map-counts/insights scripts. Required web checks
remain `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`; the legacy web build
still requires its existing Clerk/Supabase configuration.

Visualization receives a replaceable operations interface. Only the legacy
compatibility components bind Next actions to an existing analysis ID; local
snapshots have a separate contract and never enter those actions. Supabase and
GitHub remain legacy services. LangSmith is removed; legacy OpenAI explanations
remain web-only and are not a local-engine capability.

Manual acceptance remains the user's responsibility: inspect existing graph
selection, folding, categories, routes and details; run local analysis with cloud
adapters disabled, inspect coverage, and confirm the legacy UI cannot submit a
local repository root. No desktop or later-phase features are introduced here.
