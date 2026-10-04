# Phase 01 legacy writer compatibility repair

The existing server-owned secret key uses `service_role`. That role's RLS
bypass does not supply table privileges. The original eight migrations grant
member reads and RPC execution explicitly, but rely on platform defaults for
writer table privileges. Fresh projects can lack those defaults.

The new `20261004221341_legacy_writer_grants.sql` migration restores only the
operations used by the retained Cartograph workflow. It does not change tables,
RLS, policies, clients, credentials, or the local engine boundary.

| Object | Writer privileges | Existing operation |
| --- | --- | --- |
| public schema | USAGE | Resolve application tables/RPCs |
| organizations | SELECT, INSERT | Submission upsert; SELECT for conflict target |
| projects | SELECT, INSERT | Submission upsert/readback; claim's project join |
| analyses | SELECT, INSERT, UPDATE | Submission; atomic claim; stage/progress, completion, failure; CLI readback |
| files | SELECT, INSERT, DELETE | Replace snapshot; RPC endpoint lookup; CLI counts |
| edges | SELECT, INSERT | Invoker RPC inserts; CLI counts |
| routes | INSERT | Invoker RPC inserts |
| file_roles | SELECT, INSERT | Convention RPC inserts; model-role conflict-target upsert |
| ai_cache | SELECT, INSERT | Explanation-cache conflict-target upsert |

All upserts use `ignoreDuplicates: true` (`ON CONFLICT DO NOTHING`), so those
upserts need no UPDATE grant. PostgreSQL requires SELECT on conflict-target
columns even for DO NOTHING; table SELECT grants cover these reads.
See [PostgreSQL INSERT privileges](https://www.postgresql.org/docs/current/sql-insert.html).

The audit covers `lib/pipeline/submit.ts`, `run.ts`, `store.ts`,
`app/(workspace)/actions.ts`, the analysis explanation/cache actions,
`scripts/analyze.ts`, all eight original migrations, and both Supabase clients.
Member-visible reads remain on the authenticated client and its organization
policies. Only existing server writer operations gain privileges.

No current writer accesses `insights`; `explanations` was dropped by the eighth
migration. UUID defaults require no sequence grant. File deletion's existing
foreign-key cascades remove child edges/routes/roles without direct child DELETE
grants. The invoker RPCs `insert_edges(uuid,jsonb)`, `insert_routes(uuid,jsonb)`
and `insert_file_roles(uuid,jsonb)` already explicitly grant EXECUTE exclusively
to `service_role`. No replacement or extra RPC grant is needed. The existing
database-owned progress trigger publishes through `realtime.send`; the writer
does not need direct Realtime table/function grants. No default privileges or
permissions for future objects are changed.

## Apply to the already initialized development project

1. Confirm the correct development project in Supabase Dashboard. Open SQL
   Editor and a new query, using the default database-owner role.
2. Paste only the complete contents of
   `supabase/migrations/20261004221341_legacy_writer_grants.sql`, between `BEGIN;`
   and `COMMIT;`, and run it. Do not rerun the first eight migrations. This adds
   the listed privileges only; it does not insert/delete application data.
3. Run the complete `supabase/verify-legacy-writer.sql` file in a separate query.
   It contains only SELECT statements. Expect nine table rows, all with
   `required_grants_present`, `rls_enabled`, and `reader_boundary_ok` true, and
   three RPC rows with `rpc_boundary_ok` true. The writer's operation columns
   should match the table above on the fresh project. No grant is added for
   insights. Keep the results private if your project contains custom objects.
4. Applying through SQL Editor does not record CLI migration history. If you
   later use CLI migration tracking, reconcile this already-applied migration
   before pushing migrations. The GRANT statements themselves are idempotent.

## Retry the manual acceptance test

In the terminal running Cartograph, press Ctrl+C. In PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Repositorios Github\cartograph'
pnpm build
pnpm start
```

Keep `.env.local` unchanged with the working Clerk/Supabase configuration and
server-only `SUPABASE_SECRET_KEY`. Open `http://localhost:3000`, sign in, select
the active organization, submit a public GitHub repository URL, and click
Analyze. Do not submit a local path here.

Expect organization/project/analysis creation, then a claim setting running /
fetch and navigation to `/analyses/<id>`. The next background operation resolves
the latest GitHub commit, downloads its archive, and advances through select,
parse, store to complete. Watch the server terminal for failures. A GitHub
network/rate-limit failure is separate from database permissions. If an existing
analysis is displayed without starting, use its explicit rerun control.

## Verification limits

`pnpm test` checks the complete migration chain against a zero-default table
privilege baseline and checks that the repair consists only of scoped
service_role grants. It also guards the existing RPC execution boundary.
These are static regression checks, not a live PostgreSQL execution test.
The read-only SQL above and the actual Analyze/rerun test verify the deployed
project after application. No remote migration is applied by this repair task.
