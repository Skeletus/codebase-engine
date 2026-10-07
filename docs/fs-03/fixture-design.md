# FS-03 qualification fixtures

Fixtures are authoritative, synthetic, first-party source data. Applications and their configuration are never executed. Existing F03-react-vite and accepted F02-profile records remain unchanged.

| Corpus | Purpose | Oracle / checks |
| --- | --- | --- |
| F03-react-vite | Retained JS/TS, entries, events, aliases, wrappers, effects, routes, CSS, URL and worker baseline | Original pinned Vite 7/8 graphs; negative fixtures; determinism and incremental/staleness tests |
| F03-qualification | Official pinned React plugin, production inputs, conditional self-exports, public URL asset, import/query globs, worker, browser/SSR branches | Five exact tuple/profile build graphs, separate worker graphs and emitted bundle hashes |
| Controlled TS-path derivative | Same source corpus with literal Vite 8 native paths, baseUrl and explicitly exercised SSR import | Three browser/SSR compiler records; Vite 7 and complex/multiple-target metadata negatives |
| Controlled behavior derivatives | Namespace/class/context/hook and scoped imperative navigation associations | Exact rule/target assertions, original witnesses, negative version/shadow/mutation/options/dynamic-route cases |
| Packaged derivatives | Additional namespace/class/context/hook/router source probes and original entry-event-call investigation | Windows bundled engine; all distinct witnesses; full/incremental; SQLite reopen; stale HTML; denied egress; empty PATH |
| Resource derivatives | Empty-statement files at 99,998/100,000/100,002 syntax nodes; 10,001 distributed routes; bounded metadata/glob/plugin/nesting/fact cases | Accepted facts below/at limits; explicit overflow gaps or generation failure; no uniqueness from incomplete route sets |
| F02-profile | Identical retained 148-byte TS/JS comparison corpus | Historical source hash, same Node/TypeScript/ts-morph/CPU and five-fresh-session/twenty-warm protocol; three repetitions |

The active interruption test aborts an actual generation signal during React extraction, and separately injects an expired clock through the existing GenerationBoundary implementation. Both failures preserve the persisted complete generation; a fresh driver recovers. These are deterministic cooperative-boundary tests, not claims of a 120-second benchmark timeout or native worker containment.

The inherited FS-02 tests remain authoritative for static config evaluation and inventory glob limits, filesystem policy, read/cancellation/publication boundaries and 20,000-match truncation. FS-03 adds real extractor tests for its new syntax/fact/route limits. Future Python/Flow/native worker startup, IPC, OOM and 512 MiB process-job gates are outside FS-03; the existing product budgets are unchanged.

Run the full suite with `node --test tests/framework-support/fs-03.test.ts`. Run all five explicit profile checks with `node scripts/fs-03-qualification-runner.ts --all`, or one with `--tuple=vite8-react19 --profile=ssr-production`. Unknown, conflicting or unqualified pairs fail. Missing/stale oracle files fail rather than updating expectations automatically. The runner records blocked Vite 7 SSR and nonexact/range/workspace tuples.

Oracle generation is opt-in: `scripts/fs-03-oracles.mjs --run --tuple=... --expanded --profile=...`; Vite 8 paths additionally use `--case=tsconfig-paths`. Source fixture, materialized source, module graph, worker graph and bundle hashes are retained. Static alias replacements in the application-owned oracle are converted to absolute paths for the controlled root; exact named targets are compared, without claiming general cwd-dependent relative-alias equivalence. Native TS-path fixtures are materialized under ignored `.next/fs03-oracles` because Vite's resolver excludes tsconfigs below node_modules; this reproduces the protected first-party corpus location used by analysis.

`scripts/fs-03-router-oracle.mjs --run` exercises pinned trusted matchRoutes with literal application-owned data, including parameter decoding, case, trailing slash and catch-all cases. Analysis retains unknown precedence and never chooses a winner from a partial route set. Controlled compiler/runtime APIs are trusted verification tools; no inspected source/configuration is imported or invoked.

Pinned public repository commits are supplementary read-only negative validation. Their unknown/range/workspace/plugin behavior does not override fixture expectations or grant a qualification badge.
