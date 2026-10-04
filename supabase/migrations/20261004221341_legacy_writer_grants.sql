-- Legacy compatibility only: the server-owned secret key uses service_role.
-- BYPASSRLS does not confer table privileges. Do not depend on a project's
-- default grants, which can differ on a freshly initialized Supabase project.
grant usage on schema public to service_role;

-- submitRepository inserts with ON CONFLICT DO NOTHING; conflict targets
-- still require SELECT. Projects and analyses are also read back explicitly.
grant select, insert on public.organizations, public.projects to service_role;

-- claimAnalysis / continueRun update progress, completion and failure state.
grant select, insert, update on public.analyses to service_role;

-- storeResult replaces files on a rerun. Existing foreign-key cascades remove
-- their edges, routes and roles without granting direct child DELETE access.
-- The invoker RPCs read files to resolve exact relationship endpoints.
grant select, insert, delete on public.files to service_role;
grant select, insert on public.edges to service_role; -- scripts/analyze.ts counts edges
grant insert on public.routes to service_role;

-- Convention roles are inserted by RPC; model roles and AI caches use
-- conflict-target upserts with DO NOTHING, not UPDATE.
grant select, insert on public.file_roles, public.ai_cache to service_role;

-- No current writer uses insights. All IDs are UUIDs; there are no sequences.
-- insert_edges, insert_routes and insert_file_roles already explicitly grant
-- EXECUTE to service_role in their original migrations. Progress publication
-- is an existing database-owned SECURITY DEFINER trigger, not a client RPC.
-- Leave RLS, member SELECT policies, anon privileges and RPC security intact.
