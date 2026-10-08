# FS-06 per-pattern qualification

Status: **PASS** for the controlled static patterns and unresolved boundaries below. These are 79 current cases per exact tuple. Negative fixtures qualify refusal, not support for dynamic behavior. Each linked record contains fixture/output/test/oracle hashes, selected variants, extractor, current witnesses, full/incremental checks, resource outcomes and typed gaps.

| Tuple | Pattern | Claim | Record |
| --- | --- | --- | --- |
| django52 | converters/boundaries | tested unresolved boundary | [PASS](evidence/qualification/django52-converters-boundaries.json) |
| django52 | converters/builtins | qualified static declaration pattern | [PASS](evidence/qualification/django52-converters-builtins.json) |
| django52 | decorators/require_GET-false | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_GET-false.json) |
| django52 | decorators/require_GET-true | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_GET-true.json) |
| django52 | decorators/require_POST-false | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_POST-false.json) |
| django52 | decorators/require_POST-true | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_POST-true.json) |
| django52 | decorators/require_http_methods-false | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_http_methods-false.json) |
| django52 | decorators/require_http_methods-true | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_http_methods-true.json) |
| django52 | decorators/require_safe-false | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_safe-false.json) |
| django52 | decorators/require_safe-true | qualified static declaration pattern | [PASS](evidence/qualification/django52-decorators-require_safe-true.json) |
| django52 | dynamic/decorator | tested unresolved boundary | [PASS](evidence/qualification/django52-dynamic-decorator.json) |
| django52 | dynamic/escape | tested unresolved boundary | [PASS](evidence/qualification/django52-dynamic-escape.json) |
| django52 | dynamic/format-settings | tested unresolved boundary | [PASS](evidence/qualification/django52-dynamic-format-settings.json) |
| django52 | dynamic/index | tested unresolved boundary | [PASS](evidence/qualification/django52-dynamic-index.json) |
| django52 | dynamic/mutation | tested unresolved boundary | [PASS](evidence/qualification/django52-dynamic-mutation.json) |
| django52 | formats/0-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-0-inline.json) |
| django52 | formats/0-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-0-reassignment.json) |
| django52 | formats/1-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-1-inline.json) |
| django52 | formats/1-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-1-reassignment.json) |
| django52 | formats/10-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-10-inline.json) |
| django52 | formats/10-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-10-reassignment.json) |
| django52 | formats/11-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-11-inline.json) |
| django52 | formats/11-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-11-reassignment.json) |
| django52 | formats/12-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-12-inline.json) |
| django52 | formats/12-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-12-reassignment.json) |
| django52 | formats/13-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-13-inline.json) |
| django52 | formats/13-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-13-reassignment.json) |
| django52 | formats/14-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-14-inline.json) |
| django52 | formats/14-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-14-reassignment.json) |
| django52 | formats/15-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-15-inline.json) |
| django52 | formats/15-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-15-reassignment.json) |
| django52 | formats/2-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-2-inline.json) |
| django52 | formats/2-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-2-reassignment.json) |
| django52 | formats/3-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-3-inline.json) |
| django52 | formats/3-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-3-reassignment.json) |
| django52 | formats/4-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-4-inline.json) |
| django52 | formats/4-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-4-reassignment.json) |
| django52 | formats/5-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-5-inline.json) |
| django52 | formats/5-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-5-reassignment.json) |
| django52 | formats/6-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-6-inline.json) |
| django52 | formats/6-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-6-reassignment.json) |
| django52 | formats/7-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-7-inline.json) |
| django52 | formats/7-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-7-reassignment.json) |
| django52 | formats/8-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-8-inline.json) |
| django52 | formats/8-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-8-reassignment.json) |
| django52 | formats/9-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-9-inline.json) |
| django52 | formats/9-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-formats-9-reassignment.json) |
| django52 | includes/0 | qualified static declaration pattern | [PASS](evidence/qualification/django52-includes-0.json) |
| django52 | includes/1 | qualified static declaration pattern | [PASS](evidence/qualification/django52-includes-1.json) |
| django52 | includes/2 | qualified static declaration pattern | [PASS](evidence/qualification/django52-includes-2.json) |
| django52 | includes/3 | qualified static declaration pattern | [PASS](evidence/qualification/django52-includes-3.json) |
| django52 | includes/4 | qualified static declaration pattern | [PASS](evidence/qualification/django52-includes-4.json) |
| django52 | includes/5 | qualified static declaration pattern | [PASS](evidence/qualification/django52-includes-5.json) |
| django52 | models/custom-manager | tested unresolved boundary | [PASS](evidence/qualification/django52-models-custom-manager.json) |
| django52 | models/field-operation-table | qualified static declaration pattern | [PASS](evidence/qualification/django52-models-field-operation-table.json) |
| django52 | models/mutated-manager | tested unresolved boundary | [PASS](evidence/qualification/django52-models-mutated-manager.json) |
| django52 | models/relationships | qualified static declaration pattern | [PASS](evidence/qualification/django52-models-relationships.json) |
| django52 | routers/DefaultRouter-path-bare | qualified static declaration pattern | [PASS](evidence/qualification/django52-routers-DefaultRouter-path-bare.json) |
| django52 | routers/DefaultRouter-path-slash | qualified static declaration pattern | [PASS](evidence/qualification/django52-routers-DefaultRouter-path-slash.json) |
| django52 | routers/DefaultRouter-regex-bare | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-routers-DefaultRouter-regex-bare.json) |
| django52 | routers/DefaultRouter-regex-slash | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-routers-DefaultRouter-regex-slash.json) |
| django52 | routers/SimpleRouter-path-bare | qualified static declaration pattern | [PASS](evidence/qualification/django52-routers-SimpleRouter-path-bare.json) |
| django52 | routers/SimpleRouter-path-slash | qualified static declaration pattern | [PASS](evidence/qualification/django52-routers-SimpleRouter-path-slash.json) |
| django52 | routers/SimpleRouter-regex-bare | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-routers-SimpleRouter-regex-bare.json) |
| django52 | routers/SimpleRouter-regex-slash | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-routers-SimpleRouter-regex-slash.json) |
| django52 | serializers/HyperlinkedModelSerializer | qualified static declaration pattern | [PASS](evidence/qualification/django52-serializers-HyperlinkedModelSerializer.json) |
| django52 | serializers/ModelSerializer | qualified static declaration pattern | [PASS](evidence/qualification/django52-serializers-ModelSerializer.json) |
| django52 | serializers/Serializer | qualified static declaration pattern | [PASS](evidence/qualification/django52-serializers-Serializer.json) |
| django52 | serializers/opaque-meta | tested unresolved boundary | [PASS](evidence/qualification/django52-serializers-opaque-meta.json) |
| django52 | signals/conditional | tested unresolved boundary | [PASS](evidence/qualification/django52-signals-conditional.json) |
| django52 | signals/custom | tested unresolved boundary | [PASS](evidence/qualification/django52-signals-custom.json) |
| django52 | signals/duplicates | qualified static declaration pattern | [PASS](evidence/qualification/django52-signals-duplicates.json) |
| django52 | templates/ambiguous-url | tested unresolved boundary | [PASS](evidence/qualification/django52-templates-ambiguous-url.json) |
| django52 | templates/conflict | qualified static declaration pattern | [PASS](evidence/qualification/django52-templates-conflict.json) |
| django52 | templates/custom-engine | tested unresolved boundary | [PASS](evidence/qualification/django52-templates-custom-engine.json) |
| django52 | templates/cycle-unicode | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django52-templates-cycle-unicode.json) |
| django52 | templates/dynamic | tested unresolved boundary | [PASS](evidence/qualification/django52-templates-dynamic.json) |
| django52 | templates/malformed | tested unresolved boundary | [PASS](evidence/qualification/django52-templates-malformed.json) |
| django52 | templates/tag | tested unresolved boundary | [PASS](evidence/qualification/django52-templates-tag.json) |
| django60 | converters/boundaries | tested unresolved boundary | [PASS](evidence/qualification/django60-converters-boundaries.json) |
| django60 | converters/builtins | qualified static declaration pattern | [PASS](evidence/qualification/django60-converters-builtins.json) |
| django60 | decorators/require_GET-false | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_GET-false.json) |
| django60 | decorators/require_GET-true | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_GET-true.json) |
| django60 | decorators/require_POST-false | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_POST-false.json) |
| django60 | decorators/require_POST-true | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_POST-true.json) |
| django60 | decorators/require_http_methods-false | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_http_methods-false.json) |
| django60 | decorators/require_http_methods-true | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_http_methods-true.json) |
| django60 | decorators/require_safe-false | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_safe-false.json) |
| django60 | decorators/require_safe-true | qualified static declaration pattern | [PASS](evidence/qualification/django60-decorators-require_safe-true.json) |
| django60 | dynamic/decorator | tested unresolved boundary | [PASS](evidence/qualification/django60-dynamic-decorator.json) |
| django60 | dynamic/escape | tested unresolved boundary | [PASS](evidence/qualification/django60-dynamic-escape.json) |
| django60 | dynamic/format-settings | tested unresolved boundary | [PASS](evidence/qualification/django60-dynamic-format-settings.json) |
| django60 | dynamic/index | tested unresolved boundary | [PASS](evidence/qualification/django60-dynamic-index.json) |
| django60 | dynamic/mutation | tested unresolved boundary | [PASS](evidence/qualification/django60-dynamic-mutation.json) |
| django60 | formats/0-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-0-inline.json) |
| django60 | formats/0-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-0-reassignment.json) |
| django60 | formats/1-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-1-inline.json) |
| django60 | formats/1-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-1-reassignment.json) |
| django60 | formats/10-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-10-inline.json) |
| django60 | formats/10-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-10-reassignment.json) |
| django60 | formats/11-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-11-inline.json) |
| django60 | formats/11-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-11-reassignment.json) |
| django60 | formats/12-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-12-inline.json) |
| django60 | formats/12-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-12-reassignment.json) |
| django60 | formats/13-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-13-inline.json) |
| django60 | formats/13-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-13-reassignment.json) |
| django60 | formats/14-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-14-inline.json) |
| django60 | formats/14-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-14-reassignment.json) |
| django60 | formats/15-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-15-inline.json) |
| django60 | formats/15-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-15-reassignment.json) |
| django60 | formats/2-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-2-inline.json) |
| django60 | formats/2-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-2-reassignment.json) |
| django60 | formats/3-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-3-inline.json) |
| django60 | formats/3-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-3-reassignment.json) |
| django60 | formats/4-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-4-inline.json) |
| django60 | formats/4-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-4-reassignment.json) |
| django60 | formats/5-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-5-inline.json) |
| django60 | formats/5-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-5-reassignment.json) |
| django60 | formats/6-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-6-inline.json) |
| django60 | formats/6-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-6-reassignment.json) |
| django60 | formats/7-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-7-inline.json) |
| django60 | formats/7-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-7-reassignment.json) |
| django60 | formats/8-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-8-inline.json) |
| django60 | formats/8-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-8-reassignment.json) |
| django60 | formats/9-inline | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-9-inline.json) |
| django60 | formats/9-reassignment | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-formats-9-reassignment.json) |
| django60 | includes/0 | qualified static declaration pattern | [PASS](evidence/qualification/django60-includes-0.json) |
| django60 | includes/1 | qualified static declaration pattern | [PASS](evidence/qualification/django60-includes-1.json) |
| django60 | includes/2 | qualified static declaration pattern | [PASS](evidence/qualification/django60-includes-2.json) |
| django60 | includes/3 | qualified static declaration pattern | [PASS](evidence/qualification/django60-includes-3.json) |
| django60 | includes/4 | qualified static declaration pattern | [PASS](evidence/qualification/django60-includes-4.json) |
| django60 | includes/5 | qualified static declaration pattern | [PASS](evidence/qualification/django60-includes-5.json) |
| django60 | models/custom-manager | tested unresolved boundary | [PASS](evidence/qualification/django60-models-custom-manager.json) |
| django60 | models/field-operation-table | qualified static declaration pattern | [PASS](evidence/qualification/django60-models-field-operation-table.json) |
| django60 | models/mutated-manager | tested unresolved boundary | [PASS](evidence/qualification/django60-models-mutated-manager.json) |
| django60 | models/relationships | qualified static declaration pattern | [PASS](evidence/qualification/django60-models-relationships.json) |
| django60 | routers/DefaultRouter-path-bare | qualified static declaration pattern | [PASS](evidence/qualification/django60-routers-DefaultRouter-path-bare.json) |
| django60 | routers/DefaultRouter-path-slash | qualified static declaration pattern | [PASS](evidence/qualification/django60-routers-DefaultRouter-path-slash.json) |
| django60 | routers/DefaultRouter-regex-bare | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-routers-DefaultRouter-regex-bare.json) |
| django60 | routers/DefaultRouter-regex-slash | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-routers-DefaultRouter-regex-slash.json) |
| django60 | routers/SimpleRouter-path-bare | qualified static declaration pattern | [PASS](evidence/qualification/django60-routers-SimpleRouter-path-bare.json) |
| django60 | routers/SimpleRouter-path-slash | qualified static declaration pattern | [PASS](evidence/qualification/django60-routers-SimpleRouter-path-slash.json) |
| django60 | routers/SimpleRouter-regex-bare | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-routers-SimpleRouter-regex-bare.json) |
| django60 | routers/SimpleRouter-regex-slash | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-routers-SimpleRouter-regex-slash.json) |
| django60 | serializers/HyperlinkedModelSerializer | qualified static declaration pattern | [PASS](evidence/qualification/django60-serializers-HyperlinkedModelSerializer.json) |
| django60 | serializers/ModelSerializer | qualified static declaration pattern | [PASS](evidence/qualification/django60-serializers-ModelSerializer.json) |
| django60 | serializers/Serializer | qualified static declaration pattern | [PASS](evidence/qualification/django60-serializers-Serializer.json) |
| django60 | serializers/opaque-meta | tested unresolved boundary | [PASS](evidence/qualification/django60-serializers-opaque-meta.json) |
| django60 | signals/conditional | tested unresolved boundary | [PASS](evidence/qualification/django60-signals-conditional.json) |
| django60 | signals/custom | tested unresolved boundary | [PASS](evidence/qualification/django60-signals-custom.json) |
| django60 | signals/duplicates | qualified static declaration pattern | [PASS](evidence/qualification/django60-signals-duplicates.json) |
| django60 | templates/ambiguous-url | tested unresolved boundary | [PASS](evidence/qualification/django60-templates-ambiguous-url.json) |
| django60 | templates/conflict | qualified static declaration pattern | [PASS](evidence/qualification/django60-templates-conflict.json) |
| django60 | templates/custom-engine | tested unresolved boundary | [PASS](evidence/qualification/django60-templates-custom-engine.json) |
| django60 | templates/cycle-unicode | qualified declarations with explicit matcher/behavior boundaries | [PASS](evidence/qualification/django60-templates-cycle-unicode.json) |
| django60 | templates/dynamic | tested unresolved boundary | [PASS](evidence/qualification/django60-templates-dynamic.json) |
| django60 | templates/malformed | tested unresolved boundary | [PASS](evidence/qualification/django60-templates-malformed.json) |
| django60 | templates/tag | tested unresolved boundary | [PASS](evidence/qualification/django60-templates-tag.json) |

The aggregate [JSON ledger](per-pattern-qualification.json) pins the record hashes. Earlier records with other test hashes are historical and excluded. Additional CBV/MRO, settings, ownership, middleware, read-policy, watch and compatibility cases are in the complete 54-test FS-06 suite; 19 trusted framework classes per tuple are independently reproduced in evidence/rule-metadata.json.
