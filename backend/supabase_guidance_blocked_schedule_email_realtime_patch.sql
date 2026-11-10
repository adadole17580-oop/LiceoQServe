-- Publish the existing Guidance blocked-schedule table so the backend can
-- email students about new temporary office unavailability records.
-- This does not change table data, RLS, grants, or publication filters.

BEGIN;

DO $$
DECLARE
  table_oid oid := to_regclass('public.guidance_blocked_schedules');
  publication_oid oid;
  publication_all_tables boolean;
  publication_inserts boolean;
  is_published boolean;
  has_row_filter boolean;
  has_column_list boolean;
  required_column text;
BEGIN
  IF table_oid IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: public.guidance_blocked_schedules does not exist.';
  END IF;

  FOREACH required_column IN ARRAY ARRAY[
    'id',
    'office_id',
    'blocked_date',
    'start_time',
    'end_time',
    'is_all_day',
    'reason',
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
        'Preflight failed: public.guidance_blocked_schedules.% does not exist.',
        required_column;
    END IF;
  END LOOP;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = table_oid
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: RLS is not enabled on public.guidance_blocked_schedules.';
  END IF;

  SELECT oid, puballtables, pubinsert
  INTO publication_oid, publication_all_tables, publication_inserts
  FROM pg_publication
  WHERE pubname = 'supabase_realtime';

  IF publication_oid IS NULL OR NOT publication_inserts THEN
    RAISE EXCEPTION
      'Preflight failed: supabase_realtime is missing or does not publish INSERT events.';
  END IF;

  IF publication_all_tables THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_publication_rel
    WHERE prpubid = publication_oid
      AND prrelid = table_oid
  )
  INTO is_published;

  IF is_published THEN
    SELECT prqual IS NULL, prattrs IS NULL
    INTO has_row_filter, has_column_list
    FROM pg_publication_rel
    WHERE prpubid = publication_oid
      AND prrelid = table_oid;

    IF NOT has_row_filter OR NOT has_column_list THEN
      RAISE EXCEPTION
        'Preflight failed: guidance_blocked_schedules has an existing publication filter or column list; refusing to alter it.';
    END IF;
  ELSE
    EXECUTE
      'ALTER PUBLICATION supabase_realtime ADD TABLE public.guidance_blocked_schedules';
  END IF;
END
$$;

COMMIT;
