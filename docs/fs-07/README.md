# FS-07 — implementation in progress

FS-07 is **incomplete**. Metro and the initial RN/React projection are connected to the production analysis pipeline. Identified Flow sources use the bundled supervised language session and the shared graph. No complete React Native, Flow or Expo capability is qualified yet; assessments remain partial and the full acceptance ledger is authoritative.

The user approved production `hermes-parser@0.25.1` and its `hermes-estree@0.25.1` runtime closure, plus four isolated oracle tuples. Production install used `--ignore-scripts`; isolated npm installs used `--ignore-scripts --legacy-peer-deps --no-audit --no-fund`. The peer-dependency flag does not establish framework interoperability. Qualification must demonstrate each supported pattern separately.

See [acceptance](acceptance.md), [qualification matrix](qualification.md), [implementation decisions](decisions.md), and [retained evidence](evidence/).

## Implemented foundation

- Data-only Metro search kernel with extension/platform/native ordering, literal redirects, exact exports/conditional import versus require, supported wildcard exports, directory index and density-family lookup. It accepts a protected inventory supplied by its caller and has no filesystem, module-loader, config-loader or plugin authority.
- Cancellation/deadline and inventory ceilings use the existing generation boundary. Custom resolvers, denied paths, unestablished package links, unsupported exports shapes and missing exact exports targets remain boundaries.
- Twelve controlled resolver cases produce 192 records: four pinned tuples × Android/iOS × twelve cases × controlled/default contexts. Defaults were independently recorded from approved RN/Expo tools using application-owned synthetic roots. This is search-kernel parity, **not** qualification of customer configuration composition, discovery, Metro transforms or framework behavior.
- Six controlled Hermes syntax/location experiments cover classic Flow, enums, component/hook declarations, BOM/CRLF/Unicode offsets and malformed syntax. The private AST stays inside the adapter-owned worker; parent validation checks neutral facts and original ranges/hashes.
- Flow is selected only by leading pragmas in exact supported RN tuples. Composed analysis adds neutral declarations/local calls and platform-specific module dependencies to the shared snapshot. Type-only imports and imported callable targets remain explicit unsupported boundaries. Complete Flow scopes and framework qualification remain outstanding.
- Initial RN projection reuses accepted React composition, wrappers, hooks/effects and context, adds native event bindings and literal AppRegistry/Expo roots, and preserves variant-specific Metro dependencies/assets. No navigation or native implementation edge is guessed.
- The existing single-parser lease and Windows job launcher supervise Hermes with pinned assets, startup/file deadlines, bounded protocol output and recovery tests. Source fixtures verify Python/Flow lease exclusion, cancellation and malformed-source recovery. Full fault/ceiling qualification is outstanding.
- Approved runtime dependency and packaging closure addition, license copies, accepted-worktree inventory and integrity audit. No runtime parser download was added.

The expanded focused suite passes 29 tests. `scripts/fs-07-packaged-foundation.ts` checks the controlled RN/Flow foundation on all eight exact tuple/platform profiles using the staged Windows runtime, empty PATH, denied parent network access and no Metro/Expo/system Python/development tools. Its PASS applies only to roots, native events, platform dependencies, local Flow facts, serialization and repeated analysis. It does not pass the complete packaged acceptance criterion. See `evidence/packaged-foundation.json` for profile identities, hashes, observations and missing proof.

The inherited FS-06 tests regenerate their qualification timing/resource JSON and watch-status evidence during a normal regression run. `evidence/package-audit.json` retains before/after hashes, validates regenerated PASS records against the unchanged FS-06 harness, and hashes all other accepted files. Original accepted FS-06 timings are historical; they must not be silently treated as newly measured evidence.

## Reproduction

Run normal fixture verification without any installed oracle:

```powershell
node --test tests/framework-support/fs-07.test.ts
```

Developer-only regeneration, after the approved isolated tools are installed:

```powershell
node scripts/fs-07-metro-defaults.ts
node scripts/fs-07-metro-oracles.ts
node scripts/fs-07-hermes-experiment.ts
node scripts/fs-07-package-audit.ts
```

The Metro oracle uses virtual first-party files/packages and framework-owned resolver utilities. It never loads inspected configuration or application modules. Expo's actual installed wrapper is invoked independently for each release, and its resolved underlying version is recorded. Retained records include exact tuples, platform profiles, fixture/output hashes, process resource samples and missing-proof flags. These experiments do not substitute for the still-required full production, performance and packaged Windows qualification.

The initial baseline includes accepted uncommitted FS-06 changes. Comparing only Git HEAD would incorrectly omit that accepted work. Its source hashes and relevant contents are retained in `evidence/starting-inventory.json`.

The full inherited regression run passed 327 tests (316 accepted tests plus the then-current eleven FS-07 checks). The expanded focused suite passes 22 tests. Full regressions must be repeated after production integration. Inherited FS-06 tests regenerate qualification timing/resource records; the audit distinguishes those verification artifacts from accepted source changes and records before/after hashes. Accepted implementation, tests, fixtures, UI, AI and Laya files remain unchanged.
