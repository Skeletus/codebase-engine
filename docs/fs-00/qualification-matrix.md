# FS-00 qualification/version matrix

Exact targets selected on 2026-10-06. All new framework capabilities remain planned until their phase and packaged gates pass. Metadata compatibility is necessary and does not prove build/runtime behavior. The [machine-readable manifest](support-manifest.json) is authoritative; its profiles are independently selected variants, not a combined graph.

| Tuple | Exact packages | Phase | Current evidence |
| --- | --- | --- | --- |
| vite7-react18 | node 22.23.3; typescript 5.9.3; vite 7.3.7; react 18.3.1; react-dom 18.3.1; react-router 7.18.4 | FS-03 | Primary metadata checked; future qualification required |
| vite8-react19 | node 24.19.0; typescript 5.9.3; vite 8.3.3; react 19.2.8; react-dom 19.2.8; react-router 7.18.4 | FS-03 | Primary metadata checked; future qualification required |
| next15 | node 22.23.3; typescript 5.9.3; next 15.5.27; react 19.2.8; react-dom 19.2.8 | FS-04 | Primary metadata checked; future qualification required |
| next16-preservation | node 24.19.0; typescript 5.9.3; next 16.3.6; react 19.2.8; react-dom 19.2.8 | FS-04 | Existing regression baseline passed; extensions unqualified |
| next16-patch | node 24.19.0; typescript 5.9.3; next 16.3.8; react 19.2.8; react-dom 19.2.8 | FS-04 | Primary metadata checked; future qualification required |
| django52 | python 3.12.15; django 5.2.18; djangorestframework 3.16.1 | FS-06 | Primary metadata checked; future qualification required |
| django60 | python 3.13.16; django 6.0.9; djangorestframework 3.17.2 | FS-06 | Primary metadata checked; future qualification required |
| rn83-bare | node 24.19.0; react 19.2.0; react-native 0.83.10; metro 0.83.8; @react-navigation/native 7.5.0; @react-navigation/native-stack 7.20.0 | FS-07 | Primary metadata checked; future qualification required |
| rn85-bare | node 24.19.0; react 19.2.3; react-native 0.85.3; metro 0.84.6; @react-navigation/native 7.5.0; @react-navigation/native-stack 7.20.0 | FS-07 | Primary metadata checked; future qualification required |
| expo55 | node 24.19.0; expo 55.0.31; react 19.2.0; react-native 0.83.10; expo-router 55.0.18; @expo/metro 55.1.2; @expo/metro-config 55.0.27 | FS-07 | Primary metadata checked; future qualification required |
| expo56 | node 24.19.0; expo 56.0.23; react 19.2.3; react-native 0.85.3; expo-router 56.2.21; @expo/metro 56.0.2; @expo/metro-config 56.0.19 | FS-07 | Primary metadata checked; future qualification required |

The same host Node 24.19.0 packages all customer analysis. Node 22.23.3 is a target repository resolution/oracle profile, not another required installed customer runtime. TS 5.9.3 covers TS/TSX fixture semantics; JavaScript profiles cover the syntax accepted by the existing TS parser and selected Node/Vite semantics rather than promising every future ECMAScript extension.

| Syntax adapter | Exact parser artifact | Initial fixture dialect | What FS-00 actually validated |
| --- | --- | --- | --- |
| python | tree-sitter-python 0.25.0; WASM ABI 15 | 3.12.15, 3.13.16 | Syntax samples, invalid input, full/incremental agreement, cancellation/reset; no compiler completeness |
| java | tree-sitter-java 0.23.5; WASM ABI 14 | Java SE 17 | Syntax samples, invalid input, full/incremental agreement, cancellation/reset; no compiler completeness |
| kotlin | @tree-sitter-grammars/tree-sitter-kotlin 1.1.0; WASM ABI 14 | 2.0.21 | Syntax samples, invalid input, full/incremental agreement, cancellation/reset; no compiler completeness |
| swift | tree-sitter-swift 0.7.1; WASM ABI 15 | 5.9.2 | Syntax samples, invalid input, full/incremental agreement, cancellation/reset; no compiler completeness |
| objective-c | tree-sitter-objc 3.0.2; WASM ABI 14 | Clang 18.1.8 Objective-C | Syntax samples, invalid input, full/incremental agreement, cancellation/reset; no compiler completeness |
| Flow | hermes-parser 0.25.1 | Its pinned Flow grammar: classic, enum, component, hook | Syntax/invalid-input samples; no Flow inference |

Python 3.12.15 and 3.13.16 are future pinned fixture oracles. Only existing CPython 3.13.3 was executed in FS-00 for AST location comparison; do not call the target runtimes tested. Python grammar samples cover required 3.12/3.13 constructs, not all features. Native compiler oracle versions similarly identify later fixtures, not tools installed or run now. Kotlin's compact valid syntax failure is a published partial boundary. [Python releases](https://blog.python.org/2026/10/python-31022-31117/), [Python 3.12.15](https://www.python.org/downloads/release/python-31215/), [Kotlin releases](https://kotlinlang.org/docs/releases.html), [Swift releases](https://www.swift.org/install/macos/).

Expo tuples use Expo's pinned Metro fork, not an assumed vanilla Metro equivalent. Expo 56's routing dependency differs from Expo 55; qualify file-route extraction from each pinned package's conventions without assuming shared navigation internals. React Navigation 7 is a separate bare-RN extractor. Expo development/production and web-export behavior beyond the named mobile profiles require additional fixtures. Package peer constraints, Node engines and Expo bundled-module mappings are retained in [registry](evidence/registry.json), [supplement](evidence/registry-supplement.json) and [compatibility](evidence/compatibility.json).

Django 5.2/6.0 targets use compatible Python ranges; DRF 3.16.1/3.17.2 dependencies permit the selected Django versions. Actual URL/view/router oracle tests are still required before qualifying these combinations. [Django installation FAQ](https://docs.djangoproject.com/en/6.0/faq/install/), [DRF release notes](https://www.django-rest-framework.org/community/release-notes/).

React 19.3, Next 16.4, Django 6.1, Expo 57, React Native 0.87, Metro 0.87 and React Router 8 were visible in research but are excluded from the first qualification set. No rolling latest claim is made. Adding them requires an explicit manifest change and their fixtures; unsupported versions may still produce partial observations with visible capability status.
