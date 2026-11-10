-- Repair student notification reads and is_read updates without changing RLS.
-- Safe to apply more than once. This refuses to proceed if an existing
-- permissive policy or table-level UPDATE grant would expose other columns.

BEGIN;

DO $$
DECLARE
  notification_table oid := to_regclass('public.notifications');
  rls_enabled boolean;
  has_own_select_policy boolean;
  has_own_update_policy boolean;
  has_broad_select_policy boolean;
  has_broad_update_policy boolean;
  column_name text;
BEGIN
  IF notification_table IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: public.notifications does not exist.';
  END IF;

  SELECT relrowsecurity
  INTO rls_enabled
  FROM pg_class
  WHERE oid = notification_table;

  IF NOT rls_enabled THEN
    RAISE EXCEPTION
      'Preflight failed: RLS is not enabled on public.notifications.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd IN ('SELECT', 'ALL')
      AND permissive = 'PERMISSIVE'
      AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
      AND regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g')
        = 'recipient_id=auth.uid'
  )
  INTO has_own_select_policy;

  IF NOT has_own_select_policy THEN
    RAISE EXCEPTION
      'Preflight failed: an authenticated own-recipient SELECT policy was not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd IN ('SELECT', 'ALL')
      AND permissive = 'PERMISSIVE'
      AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
      AND regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g')
        <> 'recipient_id=auth.uid'
  )
  INTO has_broad_select_policy;

  IF has_broad_select_policy THEN
    RAISE EXCEPTION
      'Preflight failed: another permissive SELECT policy applies to authenticated/public users. Review existing RLS policies before granting SELECT.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd IN ('UPDATE', 'ALL')
      AND permissive = 'PERMISSIVE'
      AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
      AND regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g')
        = 'recipient_id=auth.uid'
      AND regexp_replace(lower(coalesce(with_check, '')), '[[:space:]()]', '', 'g')
        = 'recipient_id=auth.uid'
  )
  INTO has_own_update_policy;

  IF NOT has_own_update_policy THEN
    RAISE EXCEPTION
      'Preflight failed: an own-recipient UPDATE policy with matching USING and WITH CHECK expressions was not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd IN ('UPDATE', 'ALL')
      AND permissive = 'PERMISSIVE'
      AND ('authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles))
      AND (
        regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g')
          <> 'recipient_id=auth.uid'
        OR regexp_replace(lower(coalesce(with_check, '')), '[[:space:]()]', '', 'g')
          <> 'recipient_id=auth.uid'
      )
  )
  INTO has_broad_update_policy;

  IF has_broad_update_policy THEN
    RAISE EXCEPTION
      'Preflight failed: another permissive UPDATE policy applies to authenticated/public users. Review existing RLS policies before granting UPDATE.';
  END IF;

  IF has_table_privilege('authenticated', notification_table, 'UPDATE') THEN
    RAISE EXCEPTION
      'Preflight failed: authenticated already has table-level UPDATE on notifications; refusing to leave unrestricted column updates in place.';
  END IF;

  FOR column_name IN
    SELECT attribute.attname
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = notification_table
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attname <> 'is_read'
  LOOP
    IF has_column_privilege(
      'authenticated',
      notification_table,
      column_name,
      'UPDATE'
    ) THEN
      RAISE EXCEPTION
        'Preflight failed: authenticated has UPDATE on notifications.%; refusing to alter existing permissions.',
        column_name;
    END IF;
  END LOOP;

  GRANT SELECT ON TABLE public.notifications TO authenticated;
  GRANT UPDATE (is_read) ON TABLE public.notifications TO authenticated;

  IF NOT has_table_privilege('authenticated', notification_table, 'SELECT') THEN
    RAISE EXCEPTION
      'Permission check failed: authenticated does not have SELECT on notifications.';
  END IF;

  IF NOT has_column_privilege(
    'authenticated',
    notification_table,
    'is_read',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION
      'Permission check failed: authenticated does not have UPDATE on notifications.is_read.';
  END IF;

  IF has_table_privilege('authenticated', notification_table, 'UPDATE') THEN
    RAISE EXCEPTION
      'Permission check failed: authenticated has unrestricted table-level UPDATE on notifications.';
  END IF;
END
$$;

COMMIT;
