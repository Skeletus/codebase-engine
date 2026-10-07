# FS-03 scope and version matrix

The named bounded patterns below are qualified by controlled positive/negative fixtures, compiler/API oracles and Windows packaged checks. Snapshot aggregate runtime capabilities remain partial with no universal badge. Supported means an evidence-backed static source/config association; it never means the application rendered, an effect ran, or a handler executed.

| Tuple | Node oracle | TypeScript | Vite | React / DOM | Router | React plugin | Variants |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vite7-react18 | 22.23.3 | 5.9.3 | 7.3.7 | 18.3.1 | 7.18.4 | 5.2.0 | browser-development, browser-production |
| vite8-react19 | 24.19.0 | 5.9.3 | 8.3.3 | 19.2.8 | 7.18.4 | 6.1.2 | browser-development, browser-production, ssr-production |

Normal analysis defaults to browser-development; production/SSR are selected explicitly. Bundled Windows analysis uses Node 24.19.0 for both source tuples and never runs those applications. Declared exact package metadata qualifies static rules; it does not prove installed/deployed runtime identity. Vite 7 SSR and nonexact/range/workspace tuples are blocked for new claims, with legacy TS/JS still available.

| Qualified pattern | Evidence / boundary |
| --- | --- |
| HTML module scripts and multipage inputs | Five profile compiler graphs; bounded tokenizer and default/literal production selection; computed/unsafe inputs withheld |
| Literal runtime imports, aliases and conditions | First-party graph parity; explicit alias targets; type-only/Impact unchanged; ordered exact current-package exports choose development/production/node branches |
| Native Vite 8 TS paths | Three compiler profiles, nearest literal one-target metadata; Vite 7 and complex/multiple targets remain unsupported |
| Globs/assets/CSS/URL/workers | Include/exclude/eager/lazy/import/query source provenance; original and expanded compiler graphs; separate worker graph/bundle hashes; publicDir URL mapping; no generated implementation claims |
| React plugin configuration | Exact approved plugin tuples, literal default/automatic/react import source; never load inspected plugin/config; custom transforms/shadow/mutation drift remain gaps |
| JSX/components/classes/namespaces/fragments | Unique lexical bindings, class ancestry, source witnesses; unrelated uppercase helpers/mutable/dynamic targets denied |
| memo/forwardRef/lazy/aliases | Qualified API imports, direct wrapper/literal default import, named barrels with staleness proof; custom/computed wrappers remain gaps |
| Intrinsic events and direct calls | Source and packaged entry-component-event-persist investigation; custom callback props/spreads and receiver dispatch unresolved |
| Hooks/effects/cleanup/lifecycle | Named/inline callbacks, qualified callback slots, state/reducer initialization, React 19-only callbacks; class methods as associations; shadow/static/dynamic dispatch withheld |
| Context | Provider/Consumer/render callback/useContext; React 19 shorthand/use(context); dynamic/promise/unknown context stays unresolved |
| Router 7.18.4 registrations | Literal JSX/data/nested/index/layout declarations; direct/inline component-loader-action associations; no HTTP claims |
| Literal navigation | Link/NavLink/Navigate/useNavigate only with one proved scope and supported unique match; pinned decoding/case/trailing/catch-all parity; incomplete sets/unknown precedence never yield a winner |
| Development proxies | Development-only literal targets/prefix rewrites; unknown hooks/rewrite gaps; no production origin/linking |
| Security/snapshot/Impact | Protected reads, UTF-16 original positions, binary policy, v2/v3 compatibility, exact Impact, offline persistence/watch and frozen Laya regression checks |

[Qualification records](qualification.json) retain exact tuples/profiles/patterns, fixture/materialized/output hashes and positive/negative/Windows gates. [Acceptance](acceptance.md) records each previously missing gate. [Limitations](limitations.md) specify unsupported boundaries; they are never promoted into verified relationships.
