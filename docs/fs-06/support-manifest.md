# FS-06 support manifest

Phase status: **INCOMPLETE**. Extractor: `django/fs-06/1`.
Profile: `static-python-declared-environment`; resolver: `django-static`.
Snapshot: v3. Capability state: **partial**, qualification record: null.

| Target | Python | Django | Django REST Framework | Result |
| --- | --- | --- | --- | --- |
| django52 | 3.12.15 | 5.2.18 | 3.16.1 | Exact isolated oracle PASS; limited static fixtures and literal packaged smoke PASS; full qualification incomplete |
| django60 | 3.13.16 | 6.0.9 | 3.17.2 | Exact isolated oracle PASS; limited static fixtures and literal packaged smoke PASS; full qualification incomplete |

Version evidence comes from protected exact pyproject/requirements declarations.
The Python requirement must match the exact qualified pyproject declaration.
Other versions, missing versions and unqualified tuples retain explicit gaps;
they do not receive these framework dispatch/matcher guarantees.

Implemented partial scope: explicit literal settings and named-import constant
inheritance, installed app association, literal URL lists/string includes,
source-backed ordering/namespaces/mount identities, restricted matchers,
FBV/api_view and C3 CBV dispatch, path-mode SimpleRouter mappings/custom actions,
path-mode DefaultRouter root and suffix declarations with unsupported suffix
matchers, multiple explicit settings variants and mutable-container boundaries,
middleware hooks, model/field/FK, manager/QuerySet declarations and ORM intent, signals/admin/app/command
declarations, serializer Meta.model references, and literal Django templates.
See the acceptance ledger for the distinction between implemented and verified.

An apps.py-only child retains its FS-02 owner. Literal INSTALLED_APPS may
associate it with its nearest declared parent Django project. Independent
package/manage roots or child dependency metadata are excluded from that
association. Module ambiguity remains unresolved.

Boundaries include computed/wildcard settings, runtime URL registration, broad
regex/custom converters, arbitrary decorators/dispatch/metaclasses, dynamic
imports/monkey patching/reflection, custom routers/managers/query selectors,
custom template loaders/tags/engines, explicit template engine overrides,
dynamic names and denied paths. Regex-mode DefaultRouter suffixes and broader
format-suffix/include forms remain implementation/qualification gaps. Manager
and QuerySet declaration fixtures pass on both tuples; their complete model/
relationship/custom-dispatch negative matrix remains unqualified.

The production parser remains bundled Node/WASM, web-tree-sitter 0.25.10,
tree-sitter-python 0.25.0 ABI 15 behind the existing Windows job host. Django,
DRF, CPython and libffi are isolated developer oracle tools and never ship.
No production dependency or lockfile changes were made in FS-06.
