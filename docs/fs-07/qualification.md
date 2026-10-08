# FS-07 qualification matrix — incomplete

No complete capability badge is issued. Exact tuples below are independently exercised for recorded controlled patterns; they are not claims of complete language/framework support.

| Tuple | Node | React / RN | Resolver identity | Expo / Router / config | Navigation |
| --- | --- | --- | --- | --- | --- |
| rn83-bare | 24.19.0 | 19.2.0 / 0.83.10 | Metro 0.83.8 | RN config 0.83.10 | native 7.5.0 / native-stack 7.20.0 |
| rn85-bare | 24.19.0 | 19.2.3 / 0.85.3 | Metro 0.84.6 | RN config 0.85.3 | native 7.5.0 / native-stack 7.20.0 |
| expo55 | 24.19.0 | 19.2.0 / 0.83.10 | @expo/metro 55.1.2 → 0.83.8 | 55.0.31 / 55.0.18 / 55.0.27 | Router's pinned navigation utility only |
| expo56 | 24.19.0 | 19.2.3 / 0.85.3 | @expo/metro 56.0.2 → 0.84.5 | 56.0.23 / 56.2.21 / 56.0.19 | Router's bundled internal core utility |

Mobile profiles are android-development and ios-development. Windows is the analysis host; RN Windows, native implementation tracing and web exports are not qualified. Flow uses bundled hermes-parser 0.25.1 + hermes-estree 0.25.1 with original UTF-16 positions; flow-static establishes neutral facts, not typechecker/runtime certainty.

## Retained controlled pattern proof

- Twelve original resolver cases: 192 independent tuple/platform/context records in evidence/*-metro.json.
- Eight advanced resolver cases: 128 independent records in evidence/*-metro-advanced*.json. Arrays, imports, lenient fallback and redirects are qualified only for those fixtures.
- Pinned Platform selection: eight records in evidence/*-platform.json. Production branch/root/dependency tests include dynamic negatives and cross-file SDK mutation.
- Expo route/layout/dynamic/platform/array-group selection: four independent release/platform records in evidence/*-expo-routes.json. Source-backed package-entry roots and distinct array-context IDs are asserted in the production fixtures.
- URL-to-state utility: eight evidence/*-navigation-linking.json records. Expo56 uses its own bundled implementation; these do not prove full native receiver or production linking support.
- TS/JS React reuse: eight evidence/qualification/*-react-reuse.json records. Exact wrapper/event/hook/context assertions, witnesses, source/output hashes, repeated/incremental/full equality and resource observations are recorded. Flow framework extraction is explicitly missing.
- Native boundary and static/nested navigator fixture assertions run in the FS-07 suite. evidence/sidecar-mobile-profiles.json verifies both shipped variants through the unchanged desktop protocol on four tuples. Complete per-pattern production records remain outstanding.
- Packaged patterns and closure faults are recorded in evidence/packaged-foundation.json. The latest execution log determines freshness; an earlier PASS never overrides a later failing run.
- Actual Flow parser Windows job commitment and synthetic OOM/deadline/recovery are in evidence/flow-parser-commit.json and evidence/containment.json. These are separate from parent RSS and whole-engine resource ceilings.
- Equivalent captured FS-06 comparison is in evidence/performance-comparison.json. It qualifies unchanged TS/JS comparison only.

Every supported target still requires original source/hash, variant and framework-rule evidence. Conditions, candidates and unsupported boundaries are retained rather than promoted to verified edges.

## Supplementary public repository

Expo examples / stickersmash, commit 76a1dd12978a7ba54b0e318cec01a8578db3b0c0, was inspected as bounded public text with source hashes and repeatability records in evidence/public-stickersmash.json. Upstream versions were not rewritten, packages/config/application code were not executed, and this unqualified upstream tuple is not acceptance evidence for the exact manifest tuples.

## Remaining qualification

Full configuration/package/asset/ownership matrices; all platform and entry negatives; Flow framework/native intent extraction and broader lexical interoperability; full navigation/linking and Expo conventions; all IPC/fault/below-at-above ceilings; complete offline Windows pattern matrices; and per-pattern production qualification records remain required. See acceptance.md for all 27 statuses. No missing matrix is waived by a passing subset.
