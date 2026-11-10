-- Additive follow-up for projects where supabase_notifications_sync.sql
-- has already been applied.
-- This grants only notifications.is_read and adds the two Services tables
-- to supabase_realtime when they are not already published. No RLS policy
-- or existing publication entry is changed.

BEGIN;

DO $$
DECLARE
  table_oid oid := to_regclass('public.notifications');
  row_security_enabled boolean;
  has_own_recipient_policy boolean;
  column_name text;
  publication_oid oid;
  publication_all_tables boolean;
  publishes_inserts boolean;
  publishes_updates boolean;
  publishes_deletes boolean;
  target_table text;
  target_oid oid;
  target_rls_enabled boolean;
BEGIN
  IF table_oid IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: required table public.notifications does not exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = table_oid
      AND attname = 'is_read'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: required column public.notifications.is_read does not exist.';
  END IF;

  SELECT relrowsecurity
  INTO row_security_enabled
  FROM pg_class
  WHERE oid = table_oid;

  IF NOT row_security_enabled THEN
    RAISE EXCEPTION
      'Preflight failed: RLS is not enabled on public.notifications; refusing to grant notification UPDATE access.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd = 'UPDATE'
      AND permissive = 'PERMISSIVE'
      AND 'authenticated'::name = ANY(roles)
      AND regexp_replace(
        lower(coalesce(qual, '')),
        '[[:space:]()]',
        '',
        'g'
      ) = 'recipient_id=auth.uid'
      AND regexp_replace(
        lower(coalesce(with_check, '')),
        '[[:space:]()]',
        '',
        'g'
      ) = 'recipient_id=auth.uid'
  )
  INTO has_own_recipient_policy;

  IF NOT has_own_recipient_policy THEN
    RAISE EXCEPTION
      'Preflight failed: expected authenticated UPDATE policy restricting both USING and WITH CHECK to recipient_id = auth.uid() was not found.';
  END IF;

  IF has_table_privilege('authenticated', table_oid, 'UPDATE') THEN
    RAISE EXCEPTION
      'Preflight failed: authenticated already has effective table-level UPDATE on public.notifications; this additive script will not revoke or broaden existing privileges.';
  END IF;

  FOR column_name IN
    SELECT attribute.attname
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = table_oid
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attname <> 'is_read'
  LOOP
    IF has_column_privilege(
      'authenticated',
      table_oid,
      column_name,
      'UPDATE'
    ) THEN
      RAISE EXCEPTION
        'Preflight failed: authenticated already has effective UPDATE on public.notifications.%; this additive script will not revoke existing privileges.',
        column_name;
    END IF;
  END LOOP;

  GRANT UPDATE (is_read)
    ON TABLE public.notifications
    TO authenticated;

  IF NOT has_column_privilege(
    'authenticated',
    table_oid,
    'is_read',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION
      'Permission check failed: authenticated does not have effective UPDATE on public.notifications.is_read after the grant.';
  END IF;

  SELECT
    oid,
    puballtables,
    pubinsert,
    pubupdate,
    pubdelete
  INTO
    publication_oid,
    publication_all_tables,
    publishes_inserts,
    publishes_updates,
    publishes_deletes
  FROM pg_publication
  WHERE pubname = 'supabase_realtime';

  IF publication_oid IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: required publication supabase_realtime does not exist.';
  END IF;

  IF NOT publishes_inserts OR NOT publishes_updates OR NOT publishes_deletes THEN
    RAISE EXCEPTION
      'Preflight failed: supabase_realtime must publish INSERT, UPDATE, and DELETE events; this script will not alter publication event settings.';
  END IF;

  FOREACH target_table IN ARRAY ARRAY['office_schedules', 'school_events']
  LOOP
    target_oid := to_regclass(format('public.%I', target_table));
    IF target_oid IS NULL THEN
      RAISE EXCEPTION
        'Preflight failed: required Realtime table public.% does not exist.',
        target_table;
    END IF;

    SELECT relrowsecurity
    INTO target_rls_enabled
    FROM pg_class
    WHERE oid = target_oid;

    IF NOT target_rls_enabled THEN
      RAISE EXCEPTION
        'Preflight failed: RLS is not enabled on public.%; refusing to add it to supabase_realtime.',
        target_table;
    END IF;

    IF NOT publication_all_tables
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = target_table
      )
    THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        target_table
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;
