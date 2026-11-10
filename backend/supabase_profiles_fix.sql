-- Restrict client profile updates without changing or removing RLS policies.
-- This migration verifies the existing live profile policies
-- before changing column privileges. It must run as the table owner (or a
-- role with equivalent privileges).

BEGIN;

DO $$
DECLARE
  profiles_oid oid := to_regclass('public.profiles');
  required_column text;
  expected_policy record;
  actual_policy record;
  normalized_qual text;
  normalized_check text;
  target_role text;
  protected_column record;
  service_role_privileges_before jsonb;
  service_role_privileges_after jsonb;
  postgres_privileges_before jsonb;
  postgres_privileges_after jsonb;
BEGIN
  IF profiles_oid IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: required table public.profiles does not exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = profiles_oid
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Preflight failed: RLS is not enabled on public.profiles; no privileges or policies were changed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS profile_table
    JOIN pg_roles AS owner_role
      ON owner_role.oid = profile_table.relowner
    JOIN pg_roles AS executor_role
      ON executor_role.rolname = current_user
    WHERE profile_table.oid = profiles_oid
      AND (owner_role.rolname = current_user OR executor_role.rolsuper)
  ) THEN
    RAISE EXCEPTION
      'Permission preflight failed: run this migration as the owner of public.profiles or a superuser so the required grants can be changed.';
  END IF;

  IF NOT has_table_privilege('authenticated', profiles_oid, 'SELECT')
    AND NOT has_any_column_privilege('authenticated', profiles_oid, 'SELECT')
  THEN
    RAISE EXCEPTION
      'Permission preflight failed: authenticated must have effective SELECT access on public.profiles; this migration preserves authenticated SELECT.';
  END IF;

  FOREACH target_role IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'postgres'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = target_role
    ) THEN
      RAISE EXCEPTION 'Preflight failed: expected database role "%" does not exist.', target_role;
    END IF;
  END LOOP;

  FOREACH required_column IN ARRAY ARRAY[
    'id',
    'role',
    'office_id',
    'full_name',
    'contact_number',
    'updated_at'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = profiles_oid
        AND attname = required_column
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Preflight failed: required column public.profiles.% does not exist.', required_column;
    END IF;
  END LOOP;

  FOR expected_policy IN
    SELECT *
    FROM (VALUES
      (
        'Users can view their own profile'::text,
        'SELECT'::text,
        '(id=(selectauth.uid()asuid))'::text,
        NULL::text
      ),
      (
        'Users update own safe profile fields'::text,
        'UPDATE'::text,
        '((id=(selectauth.uid()asuid))and(role=(selectcurrent_user_role()ascurrent_user_role))and(not(office_idisdistinctfrom(selectcurrent_user_office_id()ascurrent_user_office_id))))'::text,
        '((id=(selectauth.uid()asuid))and(role=(selectcurrent_user_role()ascurrent_user_role))and(not(office_idisdistinctfrom(selectcurrent_user_office_id()ascurrent_user_office_id))))'::text
      )
    ) AS expected(policy_name, command, using_expression, check_expression)
  LOOP
    SELECT
      policyname,
      cmd,
      roles,
      permissive,
      qual,
      with_check
    INTO actual_policy
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = expected_policy.policy_name;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Expected existing profiles policy "%" is missing. Review and apply the approved RLS policy migration before this migration.',
        expected_policy.policy_name;
    END IF;

    IF actual_policy.cmd <> expected_policy.command
      OR actual_policy.roles <> ARRAY['authenticated']::name[]
      OR actual_policy.permissive <> 'PERMISSIVE'
    THEN
      RAISE EXCEPTION
        'Existing profiles policy "%" has unexpected command, role, or policy mode; no policies were changed.',
        expected_policy.policy_name;
    END IF;

    normalized_qual := CASE
      WHEN actual_policy.qual IS NULL THEN NULL
      ELSE regexp_replace(lower(actual_policy.qual), '[[:space:]]+', '', 'g')
    END;
    normalized_check := CASE
      WHEN actual_policy.with_check IS NULL THEN NULL
      ELSE regexp_replace(lower(actual_policy.with_check), '[[:space:]]+', '', 'g')
    END;

    IF normalized_qual IS DISTINCT FROM expected_policy.using_expression
      OR normalized_check IS DISTINCT FROM expected_policy.check_expression
    THEN
      RAISE EXCEPTION
        'Existing profiles policy "%" does not match the expected live predicate; no policies were changed.',
        expected_policy.policy_name;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
    'table', jsonb_build_array(
      has_table_privilege('service_role', profiles_oid, 'SELECT'),
      has_table_privilege('service_role', profiles_oid, 'INSERT'),
      has_table_privilege('service_role', profiles_oid, 'UPDATE'),
      has_table_privilege('service_role', profiles_oid, 'DELETE'),
      has_table_privilege('service_role', profiles_oid, 'REFERENCES'),
      has_table_privilege('service_role', profiles_oid, 'TRIGGER'),
      has_table_privilege('service_role', profiles_oid, 'TRUNCATE')
    ),
    'columns', (
      SELECT jsonb_object_agg(
        attname,
        jsonb_build_array(
          has_column_privilege('service_role', profiles_oid, attname, 'SELECT'),
          has_column_privilege('service_role', profiles_oid, attname, 'INSERT'),
          has_column_privilege('service_role', profiles_oid, attname, 'UPDATE'),
          has_column_privilege('service_role', profiles_oid, attname, 'REFERENCES')
        )
      )
      FROM pg_attribute
      WHERE attrelid = profiles_oid
        AND attnum > 0
        AND NOT attisdropped
    )
  )
  INTO service_role_privileges_before;

  SELECT jsonb_build_object(
    'table', jsonb_build_array(
      has_table_privilege('postgres', profiles_oid, 'SELECT'),
      has_table_privilege('postgres', profiles_oid, 'INSERT'),
      has_table_privilege('postgres', profiles_oid, 'UPDATE'),
      has_table_privilege('postgres', profiles_oid, 'DELETE'),
      has_table_privilege('postgres', profiles_oid, 'REFERENCES'),
      has_table_privilege('postgres', profiles_oid, 'TRIGGER'),
      has_table_privilege('postgres', profiles_oid, 'TRUNCATE')
    ),
    'columns', (
      SELECT jsonb_object_agg(
        attname,
        jsonb_build_array(
          has_column_privilege('postgres', profiles_oid, attname, 'SELECT'),
          has_column_privilege('postgres', profiles_oid, attname, 'INSERT'),
          has_column_privilege('postgres', profiles_oid, attname, 'UPDATE'),
          has_column_privilege('postgres', profiles_oid, attname, 'REFERENCES')
        )
      )
      FROM pg_attribute
      WHERE attrelid = profiles_oid
        AND attnum > 0
        AND NOT attisdropped
    )
  )
  INTO postgres_privileges_before;

  -- The application has no client-side profile INSERT, DELETE, REFERENCES,
  -- TRIGGER, or TRUNCATE path. Registration uses the backend service role.
  -- Keep authenticated SELECT and all PUBLIC/privileged-role grants untouched.
  REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
    ON TABLE public.profiles
    FROM anon, authenticated;
  REVOKE SELECT ON TABLE public.profiles FROM anon;

  FOR required_column IN
    SELECT attname
    FROM pg_attribute
    WHERE attrelid = profiles_oid
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%1$I) ON TABLE public.profiles FROM anon, authenticated',
      required_column
    );
    EXECUTE format(
      'REVOKE UPDATE (%1$I) ON TABLE public.profiles FROM anon, authenticated',
      required_column
    );
    EXECUTE format(
      'REVOKE REFERENCES (%1$I) ON TABLE public.profiles FROM anon, authenticated',
      required_column
    );
    EXECUTE format(
      'REVOKE SELECT (%1$I) ON TABLE public.profiles FROM anon',
      required_column
    );
  END LOOP;

  GRANT UPDATE (full_name, contact_number, updated_at)
    ON TABLE public.profiles
    TO authenticated;

  -- Fail and roll back if PUBLIC or an inherited role still grants client
  -- write access beyond the intended authenticated profile fields.
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF has_table_privilege(target_role, profiles_oid, 'INSERT')
      OR has_table_privilege(target_role, profiles_oid, 'UPDATE')
      OR has_table_privilege(target_role, profiles_oid, 'DELETE')
      OR has_table_privilege(target_role, profiles_oid, 'REFERENCES')
      OR has_table_privilege(target_role, profiles_oid, 'TRIGGER')
      OR has_table_privilege(target_role, profiles_oid, 'TRUNCATE')
      OR has_any_column_privilege(target_role, profiles_oid, 'INSERT')
      OR has_any_column_privilege(target_role, profiles_oid, 'REFERENCES')
    THEN
      RAISE EXCEPTION
        'Permission preflight failed: role "%" still has effective INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, or TRUNCATE access on public.profiles after revocation.',
        target_role;
    END IF;
  END LOOP;

  IF has_any_column_privilege('anon', profiles_oid, 'UPDATE') THEN
    RAISE EXCEPTION
      'Permission preflight failed: anon still has effective column-level UPDATE access on public.profiles.';
  END IF;

  IF has_table_privilege('anon', profiles_oid, 'SELECT')
    OR has_any_column_privilege('anon', profiles_oid, 'SELECT')
  THEN
    RAISE EXCEPTION
      'Permission preflight failed: anon still has effective table- or column-level SELECT access on public.profiles after revocation.';
  END IF;

  IF NOT has_table_privilege('authenticated', profiles_oid, 'SELECT')
    AND NOT has_any_column_privilege('authenticated', profiles_oid, 'SELECT')
  THEN
    RAISE EXCEPTION
      'Permission preflight failed: authenticated no longer has effective SELECT access on public.profiles.';
  END IF;

  FOR protected_column IN
    SELECT attname
    FROM pg_attribute
    WHERE attrelid = profiles_oid
      AND attnum > 0
      AND NOT attisdropped
      AND attname NOT IN ('full_name', 'contact_number', 'updated_at')
  LOOP
    IF has_column_privilege('authenticated', profiles_oid, protected_column.attname, 'UPDATE') THEN
      RAISE EXCEPTION
        'Permission preflight failed: authenticated still has effective UPDATE access to protected column public.profiles.% after revocation.',
        protected_column.attname;
    END IF;
  END LOOP;

  IF NOT has_column_privilege('authenticated', profiles_oid, 'full_name', 'UPDATE')
    OR NOT has_column_privilege('authenticated', profiles_oid, 'contact_number', 'UPDATE')
    OR NOT has_column_privilege('authenticated', profiles_oid, 'updated_at', 'UPDATE')
  THEN
    RAISE EXCEPTION
      'Permission preflight failed: authenticated is missing one or more required UPDATE grants on full_name, contact_number, or updated_at.';
  END IF;

  SELECT jsonb_build_object(
    'table', jsonb_build_array(
      has_table_privilege('service_role', profiles_oid, 'SELECT'),
      has_table_privilege('service_role', profiles_oid, 'INSERT'),
      has_table_privilege('service_role', profiles_oid, 'UPDATE'),
      has_table_privilege('service_role', profiles_oid, 'DELETE'),
      has_table_privilege('service_role', profiles_oid, 'REFERENCES'),
      has_table_privilege('service_role', profiles_oid, 'TRIGGER'),
      has_table_privilege('service_role', profiles_oid, 'TRUNCATE')
    ),
    'columns', (
      SELECT jsonb_object_agg(
        attname,
        jsonb_build_array(
          has_column_privilege('service_role', profiles_oid, attname, 'SELECT'),
          has_column_privilege('service_role', profiles_oid, attname, 'INSERT'),
          has_column_privilege('service_role', profiles_oid, attname, 'UPDATE'),
          has_column_privilege('service_role', profiles_oid, attname, 'REFERENCES')
        )
      )
      FROM pg_attribute
      WHERE attrelid = profiles_oid
        AND attnum > 0
        AND NOT attisdropped
    )
  )
  INTO service_role_privileges_after;

  SELECT jsonb_build_object(
    'table', jsonb_build_array(
      has_table_privilege('postgres', profiles_oid, 'SELECT'),
      has_table_privilege('postgres', profiles_oid, 'INSERT'),
      has_table_privilege('postgres', profiles_oid, 'UPDATE'),
      has_table_privilege('postgres', profiles_oid, 'DELETE'),
      has_table_privilege('postgres', profiles_oid, 'REFERENCES'),
      has_table_privilege('postgres', profiles_oid, 'TRIGGER'),
      has_table_privilege('postgres', profiles_oid, 'TRUNCATE')
    ),
    'columns', (
      SELECT jsonb_object_agg(
        attname,
        jsonb_build_array(
          has_column_privilege('postgres', profiles_oid, attname, 'SELECT'),
          has_column_privilege('postgres', profiles_oid, attname, 'INSERT'),
          has_column_privilege('postgres', profiles_oid, attname, 'UPDATE'),
          has_column_privilege('postgres', profiles_oid, attname, 'REFERENCES')
        )
      )
      FROM pg_attribute
      WHERE attrelid = profiles_oid
        AND attnum > 0
        AND NOT attisdropped
    )
  )
  INTO postgres_privileges_after;

  IF service_role_privileges_before IS DISTINCT FROM service_role_privileges_after THEN
    RAISE EXCEPTION
      'Permission preflight failed: this migration would change effective public.profiles write privileges for service_role; no migration changes were committed.';
  END IF;

  IF postgres_privileges_before IS DISTINCT FROM postgres_privileges_after THEN
    RAISE EXCEPTION
      'Permission preflight failed: this migration would change effective public.profiles write privileges for postgres; no migration changes were committed.';
  END IF;
END
$$;

COMMIT;
