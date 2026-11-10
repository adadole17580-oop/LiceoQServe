-- Create in-app notifications for student-visible events, office schedules,
-- and active office services. The backend delivers email for the generated
-- general-post notifications through the notifications Realtime feed.
--
-- This patch does not add tables or columns and does not change RLS/grants.
-- It intentionally does not attach triggers to request, appointment, or queue
-- tables. The current repository has no campus/office announcements table.

BEGIN;

DO $$
DECLARE
  target_table text;
  target_oid oid;
  required_column text;
  required_columns text[];
  notifications_oid oid := to_regclass('public.notifications');
  profiles_oid oid := to_regclass('public.profiles');
  offices_oid oid := to_regclass('public.offices');
BEGIN
  IF notifications_oid IS NULL OR profiles_oid IS NULL OR offices_oid IS NULL THEN
    RAISE EXCEPTION
      'Preflight failed: expected notifications, profiles, and offices tables are required.';
  END IF;

  FOREACH required_column IN ARRAY ARRAY[
    'recipient_id', 'title', 'category', 'message', 'related_id',
    'is_read', 'event_key'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = notifications_oid
        AND attname = required_column
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION
        'Preflight failed: public.notifications.% does not exist.',
        required_column;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_data
    WHERE index_data.indrelid = notifications_oid
      AND index_data.indisunique
      AND index_data.indisvalid
      AND index_data.indisready
      AND index_data.indnkeyatts = 1
      AND index_data.indexprs IS NULL
      AND pg_get_indexdef(index_data.indexrelid, 1, true) = 'event_key'
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: a valid unique index on notifications.event_key is required for notification idempotency.';
  END IF;

  FOREACH required_column IN ARRAY ARRAY['id', 'role', 'is_active']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = profiles_oid
        AND attname = required_column
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION
        'Preflight failed: public.profiles.% does not exist.',
        required_column;
    END IF;
  END LOOP;

  FOREACH required_column IN ARRAY ARRAY['id', 'name', 'is_active']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = offices_oid
        AND attname = required_column
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION
        'Preflight failed: public.offices.% does not exist.',
        required_column;
    END IF;
  END LOOP;

  FOREACH target_table IN ARRAY ARRAY[
    'school_events', 'office_schedules', 'office_services'
  ]
  LOOP
    target_oid := to_regclass(format('public.%I', target_table));
    IF target_oid IS NULL THEN
      RAISE EXCEPTION
        'Preflight failed: public.% does not exist.',
        target_table;
    END IF;

    required_columns := CASE target_table
      WHEN 'school_events' THEN ARRAY[
        'id', 'title', 'description', 'starts_at', 'ends_at', 'location',
        'event_type', 'office_id', 'is_published'
      ]
      WHEN 'office_schedules' THEN ARRAY[
        'id', 'office_id', 'day_of_week', 'opens_at', 'closes_at',
        'is_closed', 'effective_date', 'note'
      ]
      ELSE ARRAY['id', 'name', 'office_id', 'is_active']
    END;

    FOREACH required_column IN ARRAY required_columns
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = target_oid
          AND attname = required_column
          AND attnum > 0
          AND NOT attisdropped
      ) THEN
        RAISE EXCEPTION
          'Preflight failed: public.%.% does not exist.',
          target_table,
          required_column;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: notifications is not in supabase_realtime. Apply the existing notification Realtime patch first.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.notify_students_for_general_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
  old_row jsonb;
  content jsonb;
  previous_content jsonb;
  content_fingerprint text;
  record_id text;
  office_id text;
  office_name text;
  post_title text;
  post_message text;
  post_category text;
  related_id_type text;
  recipient record;
  is_student_facing boolean := false;
  is_active_now boolean;
  was_active boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);
  END IF;

  record_id := new_row ->> 'id';
  office_id := nullif(new_row ->> 'office_id', '');
  IF record_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'school_events' THEN
      IF lower(coalesce(new_row ->> 'is_published', 'false')) <> 'true' THEN
        RETURN NEW;
      END IF;
      content := jsonb_build_object(
        'title', new_row ->> 'title',
        'description', new_row ->> 'description',
        'starts_at', new_row ->> 'starts_at',
        'ends_at', new_row ->> 'ends_at',
        'location', new_row ->> 'location',
        'event_type', new_row ->> 'event_type',
        'office_id', office_id,
        'is_published', new_row ->> 'is_published'
      );
      IF TG_OP = 'UPDATE' THEN
        previous_content := jsonb_build_object(
          'title', old_row ->> 'title',
          'description', old_row ->> 'description',
          'starts_at', old_row ->> 'starts_at',
          'ends_at', old_row ->> 'ends_at',
          'location', old_row ->> 'location',
          'event_type', old_row ->> 'event_type',
          'office_id', old_row ->> 'office_id',
          'is_published', old_row ->> 'is_published'
        );
        IF content = previous_content THEN
          RETURN NEW;
        END IF;
      END IF;
      is_student_facing := true;
      post_title := coalesce(nullif(new_row ->> 'title', ''), 'Campus event');
      post_category := CASE WHEN office_id IS NULL
        THEN 'campus_event'
        ELSE 'office_event'
      END;
      post_message := concat_ws(
        E'\n',
        nullif(new_row ->> 'description', ''),
        CASE
          WHEN new_row ->> 'starts_at' IS NOT NULL
            THEN 'Starts: ' || (new_row ->> 'starts_at')
        END,
        CASE
          WHEN new_row ->> 'ends_at' IS NOT NULL
            THEN 'Ends: ' || (new_row ->> 'ends_at')
        END,
        CASE
          WHEN new_row ->> 'location' IS NOT NULL
            THEN 'Location: ' || (new_row ->> 'location')
        END
      );

    WHEN 'office_schedules' THEN
      content := jsonb_build_object(
        'office_id', office_id,
        'day_of_week', new_row ->> 'day_of_week',
        'opens_at', new_row ->> 'opens_at',
        'closes_at', new_row ->> 'closes_at',
        'is_closed', new_row ->> 'is_closed',
        'effective_date', new_row ->> 'effective_date',
        'note', new_row ->> 'note'
      );
      IF TG_OP = 'UPDATE' THEN
        previous_content := jsonb_build_object(
          'office_id', old_row ->> 'office_id',
          'day_of_week', old_row ->> 'day_of_week',
          'opens_at', old_row ->> 'opens_at',
          'closes_at', old_row ->> 'closes_at',
          'is_closed', old_row ->> 'is_closed',
          'effective_date', old_row ->> 'effective_date',
          'note', old_row ->> 'note'
        );
        IF content = previous_content THEN
          RETURN NEW;
        END IF;
      END IF;
      is_student_facing := true;
      post_title := 'Office schedule update';
      post_category := 'office_schedule';
      post_message := concat_ws(
        E'\n',
        CASE
          WHEN new_row ->> 'effective_date' IS NOT NULL
            THEN 'Date: ' || (new_row ->> 'effective_date')
          ELSE 'Day of week: ' || coalesce(new_row ->> 'day_of_week', 'Unavailable')
        END,
        CASE
          WHEN lower(coalesce(new_row ->> 'is_closed', 'false')) = 'true'
            THEN 'Closed'
          ELSE 'Hours: '
            || coalesce(new_row ->> 'opens_at', 'Unavailable')
            || '–'
            || coalesce(new_row ->> 'closes_at', 'Unavailable')
        END,
        nullif(new_row ->> 'note', '')
      );

    WHEN 'office_services' THEN
      is_active_now := lower(coalesce(new_row ->> 'is_active', 'false')) = 'true';
      IF TG_OP = 'UPDATE' THEN
        was_active := lower(coalesce(old_row ->> 'is_active', 'false')) = 'true';
      END IF;
      IF NOT is_active_now AND NOT was_active THEN
        RETURN NEW;
      END IF;
      content := jsonb_build_object(
        'office_id', office_id,
        'name', new_row ->> 'name',
        'is_active', new_row ->> 'is_active'
      );
      IF TG_OP = 'UPDATE' THEN
        previous_content := jsonb_build_object(
          'office_id', old_row ->> 'office_id',
          'name', old_row ->> 'name',
          'is_active', old_row ->> 'is_active'
        );
        IF content = previous_content THEN
          RETURN NEW;
        END IF;
      END IF;
      is_student_facing := true;
      post_title := 'Office service update';
      post_category := 'office_service';
      IF is_active_now THEN
        post_message := 'Service: ' || coalesce(new_row ->> 'name', 'Service information updated.');
      ELSE
        post_message := 'Service no longer available: '
          || coalesce(new_row ->> 'name', 'Office service');
      END IF;

    ELSE
      RETURN NEW;
  END CASE;

  IF NOT is_student_facing THEN
    RETURN NEW;
  END IF;

  IF office_id IS NOT NULL THEN
    SELECT office.name
    INTO office_name
    FROM public.offices AS office
    WHERE office.id::text = office_id
      AND office.is_active IS TRUE;
    IF office_name IS NULL THEN
      RETURN NEW;
    END IF;
  ELSE
    office_name := 'Campus-wide';
  END IF;

  SELECT format_type(attribute.atttypid, attribute.atttypmod)
  INTO related_id_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = to_regclass('public.notifications')
    AND attribute.attname = 'related_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF related_id_type IS NULL THEN
    RAISE EXCEPTION 'Cannot create post notification: notifications.related_id has no type.';
  END IF;

  content_fingerprint := md5(content::text);
  FOR recipient IN
    SELECT profile.id
    FROM public.profiles AS profile
    WHERE profile.role = 'student'
      AND profile.is_active IS TRUE
  LOOP
    EXECUTE format(
      'INSERT INTO public.notifications
         (recipient_id, title, category, message, related_id, event_key, is_read)
       VALUES ($1, $2, $3, $4, $5::%s, $6, false)
       ON CONFLICT DO NOTHING',
      related_id_type
    )
    USING
      recipient.id,
      post_title,
      post_category,
      'Office: ' || office_name || E'\n' || coalesce(post_message, 'An update was posted.'),
      record_id,
      'general-post:' || TG_TABLE_NAME || ':' || record_id || ':'
        || content_fingerprint || ':' || recipient.id::text;
  END LOOP;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.notify_students_for_general_post() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_students_for_general_post() FROM anon, authenticated;

DROP TRIGGER IF EXISTS notify_students_on_school_event_post ON public.school_events;
CREATE TRIGGER notify_students_on_school_event_post
AFTER INSERT OR UPDATE ON public.school_events
FOR EACH ROW EXECUTE FUNCTION public.notify_students_for_general_post();

DROP TRIGGER IF EXISTS notify_students_on_office_schedule_post ON public.office_schedules;
CREATE TRIGGER notify_students_on_office_schedule_post
AFTER INSERT OR UPDATE ON public.office_schedules
FOR EACH ROW EXECUTE FUNCTION public.notify_students_for_general_post();

DROP TRIGGER IF EXISTS notify_students_on_office_service_post ON public.office_services;
CREATE TRIGGER notify_students_on_office_service_post
AFTER INSERT OR UPDATE ON public.office_services
FOR EACH ROW EXECUTE FUNCTION public.notify_students_for_general_post();

COMMIT;
