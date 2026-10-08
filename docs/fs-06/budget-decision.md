# FS-06 mixed-extractor budget decision

The user approved reusing the accepted shared fact budget and limiting Django
bindings to 20,000 additions per generation. This supersedes the interrupted
implementation's 20,000 total shared-binding check.

Django records every new binding, route registration and uncertainty fact through
the existing shared reservation API: 20,000 new facts per source file and
200,000 per generation. It measures its additional binding quota relative to the
binding count on entry. Existing TS/JS/Python bindings are retained unchanged.
The shared 10,000 route and 31 MiB snapshot ceilings still apply. A failed
generation is discarded; no partial graph is published.

The decision preserves composition: adding Django to an already valid mixed
project must not exhaust a new framework quota merely because another extractor
has already produced facts. It does not exempt new Django facts from shared
resource accounting or enlarge any inherited limit.

Validation:

- [Mixed project](evidence/mixed-budget.json): 20,008 existing bindings, two
  additions, exact preservation of prior bindings/behavior/relationships and
  SQLite publication/load equivalence below the snapshot ceiling.
- [Added-binding boundary](evidence/binding-boundary.json): real source reaches
  19,999 and 20,000 additions and refuses the 20,001st. The stricter snapshot
  ceiling can refuse publication before this quota; discarded counters are
  measurement evidence, not published graph facts. Fresh analysis recovers.
- [Shared reservations](evidence/shared-fact-budgets.json): below/at/above the
  per-file and generation ceilings. Reservation-only tests complement real
  source integration and do not manufacture semantic facts.
- [Route expansion](evidence/expansion-budget-probes.json): below/at counters,
  above-limit refusal, independent snapshot refusal and fresh recovery.
