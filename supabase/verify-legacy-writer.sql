-- Read-only verification after applying the legacy_writer_grants migration.
-- Run as the SQL Editor's database owner. All checks should be true.
with required(table_name, need_select, need_insert, need_update, need_delete) as (
  values
    ('organizations', true, true, false, false),
    ('projects', true, true, false, false),
    ('analyses', true, true, true, false),
    ('files', true, true, false, true),
    ('edges', true, true, false, false),
    ('routes', false, true, false, false),
    ('file_roles', true, true, false, false),
    ('ai_cache', true, true, false, false),
    ('insights', false, false, false, false)
), privileges as (
  select r.*, c.relrowsecurity as rls_enabled,
    has_schema_privilege('service_role', 'public', 'USAGE') as schema_usage,
    has_table_privilege('service_role', c.oid, 'SELECT') as can_select,
    has_table_privilege('service_role', c.oid, 'INSERT') as can_insert,
    has_table_privilege('service_role', c.oid, 'UPDATE') as can_update,
    has_table_privilege('service_role', c.oid, 'DELETE') as can_delete,
    has_table_privilege('authenticated', c.oid, 'SELECT')
      and not has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      and not has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      as reader_boundary_ok
  from required r
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = r.table_name
)
select table_name, schema_usage, can_select, can_insert, can_update, can_delete,
  coalesce(schema_usage and (not need_select or can_select)
    and (not need_insert or can_insert) and (not need_update or can_update)
    and (not need_delete or can_delete), false) as required_grants_present,
  coalesce(rls_enabled, false) as rls_enabled,
  coalesce(reader_boundary_ok, false) as reader_boundary_ok
from privileges
order by table_name;

with required(signature) as (
  values ('public.insert_edges(uuid,jsonb)'), ('public.insert_routes(uuid,jsonb)'),
    ('public.insert_file_roles(uuid,jsonb)')
)
select signature,
  coalesce(has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE'), false)
    and not coalesce(has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE'), true)
    and not coalesce(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), true)
    as rpc_boundary_ok
from required
order by signature;
