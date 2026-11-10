-- Add notification and Library-loan idempotency keys, then publish the
-- tables used by the student frontend's Supabase Realtime subscriptions.
-- The only privilege change is the notification is_read update grant.
-- This migration does not change RLS policies.

BEGIN;

DO $$
DECLARE
  target_table text;
  table_oid oid;
  row_security_enabled boolean;
  publication_oid oid;
  publication_all_tables boolean;
  publication_inserts boolean;
  publication_updates boolean;
  publication_deletes boolean;
  catalog_has_row_filter boolean;
  catalog_has_column_list boolean;
  is_published boolean;
  is_unfiltered boolean;
  has_all_columns boolean;
BEGIN
  SELECT oid, puballtables, pubinsert, pubupdate, pubdelete
  INTO
    publication_oid,
    publication_all_tables,
    publication_inserts,
    publication_updates,
    publication_deletes
  FROM pg_publication
  WHERE pubname = 'supabase_realtime';

  IF publication_oid IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: required publication supabase_realtime does not exist.';
  END IF;

  IF NOT publication_inserts OR NOT publication_updates OR NOT publication_deletes THEN
    RAISE EXCEPTION
      'Preflight failed: supabase_realtime must publish INSERT, UPDATE, and DELETE events for the frontend subscriptions.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'pg_catalog.pg_publication_rel'::regclass
      AND attname = 'prqual'
      AND attnum > 0
      AND NOT attisdropped
  )
  INTO catalog_has_row_filter;

  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'pg_catalog.pg_publication_rel'::regclass
      AND attname = 'prattrs'
      AND attnum > 0
      AND NOT attisdropped
  )
  INTO catalog_has_column_list;

  IF NOT catalog_has_row_filter OR NOT catalog_has_column_list THEN
    RAISE EXCEPTION
      'Preflight failed: PostgreSQL catalog does not expose publication row-filter and column-list metadata; refusing to alter supabase_realtime without verifying restrictions.';
  END IF;

  FOREACH target_table IN ARRAY ARRAY[
    'queues',
    'appointments',
    'service_requests',
    'reservations',
    'service_history',
    'profiles',
    'book_loans',
    'library_books',
    'office_services',
    'offices',
    'office_schedules',
    'school_events',
    'notifications'
  ]
  LOOP
    table_oid := to_regclass(format('public.%I', target_table));
    IF table_oid IS NULL THEN
      RAISE EXCEPTION
        'Preflight failed: required Realtime table public.% does not exist.',
        target_table;
    END IF;

    SELECT relrowsecurity
    INTO row_security_enabled
    FROM pg_class
    WHERE oid = table_oid;

    IF NOT row_security_enabled THEN
      RAISE EXCEPTION
        'Preflight failed: RLS is not enabled on public.%; no schema or publication changes were made.',
        target_table;
    END IF;

    IF NOT publication_all_tables THEN
      SELECT EXISTS (
        SELECT 1
        FROM pg_publication_rel
        WHERE prpubid = publication_oid
          AND prrelid = table_oid
      )
      INTO is_published;

      IF is_published THEN
        EXECUTE
          'SELECT pr.prqual IS NULL, pr.prattrs IS NULL
           FROM pg_catalog.pg_publication_rel AS pr
           WHERE pr.prpubid = $1 AND pr.prrelid = $2'
        INTO is_unfiltered, has_all_columns
        USING publication_oid, table_oid;

        IF NOT is_unfiltered THEN
          RAISE EXCEPTION
            'Preflight failed: public.% already has a row filter in supabase_realtime; refusing to change or broaden it.',
            target_table;
        END IF;

        IF NOT has_all_columns THEN
          RAISE EXCEPTION
            'Preflight failed: public.% already has a column restriction in supabase_realtime; refusing to change or broaden it.',
            target_table;
        END IF;
      END IF;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  required_column text;
  column_type text;
  table_oid oid := to_regclass('public.notifications');
BEGIN
  FOREACH required_column IN ARRAY ARRAY[
    'recipient_id',
    'related_id',
    'category',
    'title',
    'message',
    'is_read',
    'created_at'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = table_oid
        AND attname = required_column
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION
        'Preflight failed: required notification column public.notifications.% does not exist.',
        required_column;
    END IF;
  END LOOP;

  SELECT format_type(atttypid, atttypmod)
  INTO column_type
  FROM pg_attribute
  WHERE attrelid = table_oid
    AND attname = 'event_key'
    AND attnum > 0
    AND NOT attisdropped;

  IF NOT FOUND THEN
    ALTER TABLE public.notifications ADD COLUMN event_key text;
  ELSIF column_type <> 'text' THEN
    RAISE EXCEPTION
      'Preflight failed: public.notifications.event_key has type %, expected text.',
      column_type;
  END IF;
END
$$;

DO $$
DECLARE
  request_id_type text;
  source_request_id_type text;
  loan_table oid := to_regclass('public.book_loans');
  request_table oid := to_regclass('public.service_requests');
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = request_table
      AND attname = 'id'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: required key public.service_requests.id does not exist.';
  END IF;

  SELECT format_type(atttypid, atttypmod)
  INTO request_id_type
  FROM pg_attribute
  WHERE attrelid = request_table
    AND attname = 'id'
    AND attnum > 0
    AND NOT attisdropped;

  IF request_id_type <> 'uuid' THEN
    RAISE EXCEPTION
      'Preflight failed: public.service_requests.id has type %, expected uuid.',
      request_id_type;
  END IF;

  SELECT format_type(atttypid, atttypmod)
  INTO source_request_id_type
  FROM pg_attribute
  WHERE attrelid = loan_table
    AND attname = 'source_request_id'
    AND attnum > 0
    AND NOT attisdropped;

  IF NOT FOUND THEN
    ALTER TABLE public.book_loans ADD COLUMN source_request_id uuid;
  ELSIF source_request_id_type <> 'uuid' THEN
    RAISE EXCEPTION
      'Preflight failed: public.book_loans.source_request_id has type %, expected uuid.',
      source_request_id_type;
  END IF;
END
$$;

DO $$
DECLARE
  has_own_notification_update_policy boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND cmd = 'UPDATE'
      AND roles = ARRAY['authenticated']::name[]
      AND permissive = 'PERMISSIVE'
      AND regexp_replace(lower(qual), '[[:space:]]+', '', 'g')
        IN ('recipient_id=auth.uid()', '(recipient_id=auth.uid())')
      AND regexp_replace(lower(with_check), '[[:space:]]+', '', 'g')
        IN ('recipient_id=auth.uid()', '(recipient_id=auth.uid())')
  )
  INTO has_own_notification_update_policy;

  IF NOT has_own_notification_update_policy THEN
    RAISE EXCEPTION
      'Preflight failed: expected authenticated own-recipient UPDATE policy is missing or differs on public.notifications; no notification privileges were changed.';
  END IF;

  GRANT UPDATE (is_read)
    ON TABLE public.notifications
    TO authenticated;

  IF NOT has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE') THEN
    RAISE EXCEPTION
      'Permission preflight failed: authenticated does not have effective UPDATE on public.notifications.is_read after the grant.';
  END IF;
END
$$;

DO $$
DECLARE
  index_spec record;
  duplicate_values boolean;
  named_index record;
  equivalent_index_exists boolean;
  normalized_predicate text;
BEGIN
  FOR index_spec IN
    SELECT *
    FROM (VALUES
      (
        'notifications'::text,
        'event_key'::text,
        'notifications_event_key_unique'::text
      ),
      (
        'book_loans'::text,
        'source_request_id'::text,
        'book_loans_source_request_id_unique'::text
      )
    ) AS expected(table_name, column_name, index_name)
  LOOP
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1
         FROM public.%I
         WHERE %I IS NOT NULL
         GROUP BY %I
         HAVING count(*) > 1
       )',
      index_spec.table_name,
      index_spec.column_name,
      index_spec.column_name
    )
    INTO duplicate_values;

    IF duplicate_values THEN
      RAISE EXCEPTION
        'Preflight failed: duplicate non-null values exist in public.%.%; resolve them before creating the unique index.',
        index_spec.table_name,
        index_spec.column_name;
    END IF;

    SELECT
      table_class.relname AS table_name,
      index_data.indisunique,
      index_data.indisvalid,
      index_data.indisready,
      index_data.indnatts,
      index_data.indnkeyatts,
      index_data.indexprs IS NULL AS is_plain_column_index,
      access_method.amname AS access_method,
      pg_get_indexdef(index_class.oid, 1, true) AS indexed_column,
      CASE
        WHEN index_data.indpred IS NULL THEN NULL
        ELSE regexp_replace(
          lower(pg_get_expr(index_data.indpred, index_data.indrelid)),
          '[[:space:]()"]',
          '',
          'g'
        )
      END AS predicate
    INTO named_index
    FROM pg_class AS index_class
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_class.relnamespace
    LEFT JOIN pg_index AS index_data
      ON index_data.indexrelid = index_class.oid
    LEFT JOIN pg_class AS table_class
      ON table_class.oid = index_data.indrelid
    LEFT JOIN pg_am AS access_method
      ON access_method.oid = index_class.relam
    WHERE index_namespace.nspname = 'public'
      AND index_class.relname = index_spec.index_name;

    IF FOUND THEN
      normalized_predicate := regexp_replace(
        index_spec.column_name || ' IS NOT NULL',
        '[[:space:]()"]',
        '',
        'g'
      );

      IF named_index.table_name IS DISTINCT FROM index_spec.table_name
        OR named_index.indisunique IS DISTINCT FROM true
        OR named_index.indisvalid IS DISTINCT FROM true
        OR named_index.indisready IS DISTINCT FROM true
        OR named_index.indnatts IS DISTINCT FROM 1
        OR named_index.indnkeyatts IS DISTINCT FROM 1
        OR named_index.is_plain_column_index IS DISTINCT FROM true
        OR named_index.access_method IS DISTINCT FROM 'btree'
        OR named_index.indexed_column IS DISTINCT FROM index_spec.column_name
        OR named_index.predicate IS DISTINCT FROM normalized_predicate
      THEN
        RAISE EXCEPTION
          'Preflight failed: existing index public.% does not match the required unique partial index on public.%.% WHERE % IS NOT NULL.',
          index_spec.index_name,
          index_spec.table_name,
          index_spec.column_name,
          index_spec.column_name;
      END IF;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM pg_index AS index_data
        JOIN pg_class AS table_class
          ON table_class.oid = index_data.indrelid
        JOIN pg_class AS index_class
          ON index_class.oid = index_data.indexrelid
        JOIN pg_namespace AS table_namespace
          ON table_namespace.oid = table_class.relnamespace
        JOIN pg_am AS access_method
          ON access_method.oid = index_class.relam
        WHERE table_namespace.nspname = 'public'
          AND table_class.relname = index_spec.table_name
          AND index_data.indisunique
          AND index_data.indisvalid
          AND index_data.indisready
          AND index_data.indnatts = 1
          AND index_data.indnkeyatts = 1
          AND index_data.indexprs IS NULL
          AND access_method.amname = 'btree'
          AND pg_get_indexdef(index_class.oid, 1, true) = index_spec.column_name
          AND regexp_replace(
            lower(pg_get_expr(index_data.indpred, index_data.indrelid)),
            '[[:space:]()"]',
            '',
            'g'
          ) = regexp_replace(
            lower(index_spec.column_name || ' IS NOT NULL'),
            '[[:space:]()"]',
            '',
            'g'
          )
      )
      INTO equivalent_index_exists;

      IF NOT equivalent_index_exists THEN
        EXECUTE format(
          'CREATE UNIQUE INDEX %I ON public.%I (%I) WHERE %I IS NOT NULL',
          index_spec.index_name,
          index_spec.table_name,
          index_spec.column_name,
          index_spec.column_name
        );
      END IF;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  target_table text;
  publication_all_tables boolean;
BEGIN
  SELECT puballtables
  INTO publication_all_tables
  FROM pg_publication
  WHERE pubname = 'supabase_realtime';

  IF NOT publication_all_tables THEN
    FOREACH target_table IN ARRAY ARRAY[
      'queues',
      'appointments',
      'service_requests',
      'reservations',
      'service_history',
      'profiles',
      'book_loans',
      'library_books',
      'office_services',
      'offices',
      'office_schedules',
      'school_events',
      'notifications'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = target_table
      ) THEN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
          target_table
        );
      END IF;
    END LOOP;
  END IF;
END
$$;

COMMIT;
