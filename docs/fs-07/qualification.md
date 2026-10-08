# FS-07 qualification matrix — no production qualification yet

All initial profiles are `android-development` and `ios-development`. Windows refers to the desktop analysis host; RN Windows and web exports are outside this initial matrix.

| Tuple | Node | React / RN | Metro oracle | Expo / Router / Metro config | React Navigation | Current qualification |
| --- | --- | --- | --- | --- | --- | --- |
| rn83-bare | 24.19.0 | 19.2.0 / 0.83.10 | 0.83.8 | — | native 7.5.0 / native-stack 7.20.0 | Search-kernel experiments only |
| rn85-bare | 24.19.0 | 19.2.3 / 0.85.3 | 0.84.6 | — | native 7.5.0 / native-stack 7.20.0 | Search-kernel experiments only |
| expo55 | 24.19.0 | 19.2.0 / 0.83.10 | @expo/metro 55.1.2 → resolver 0.83.8 | 55.0.31 / 55.0.18 / 55.0.27 | Not independently claimed | Search-kernel experiments only |
| expo56 | 24.19.0 | 19.2.3 / 0.85.3 | @expo/metro 56.0.2 → resolver 0.84.5 | 56.0.23 / 56.2.21 / 56.0.19 | Not independently claimed | Search-kernel experiments only |

Flow grammar: `hermes-parser@0.25.1`, runtime dependency `hermes-estree@0.25.1`, ESTree/Flow enabled. No Flow typechecker version or complete language capability is qualified.

## Controlled patterns

All eight tuple/platform records agree with the kernel for the fixture's twelve cases: platform priority; native fallback; extension-before-platform ordering; exact explicit extension; directory index; image density family; import and require conditional exports; exact subpath exports; wildcard exports; literal local redirect; disabled redirect. See `evidence/*-metro.json` and the fixture hash embedded in each record.

Kernel extractor source: `lib/parser/adapters/metro-resolution.ts`. Production RN/Metro extractor version is `fs-07/1`; neutral Flow syntax uses `flow/syntax/fs-07/1`. No qualified capability badge exists. Focused pipeline witnesses and repeated/incremental tests pass for the implemented subset; complete publication/variant-switch, imported-call and configuration-composition proof is missing. Experiment records must not be promoted into complete snapshot qualification records.

Hermes experiment records contain syntax node/range output for six controlled cases. They explicitly set scope and production supervision qualification to false. No inspected application was executed.

Approved framework-owned RN/Expo default tools were recorded independently and their context parity tested. `evidence/packaged-foundation.json` records eight offline Windows foundation profiles; full packaged pattern/fault qualification remains outstanding. Supplementary public repositories, navigation/Expo route matrices and equivalent resource/performance comparison also remain outstanding. Their absence cannot be replaced by foundation experiments.
