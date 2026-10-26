-- PROPOSED ONLY: review against the live database before applying.
-- This file has not been run. It replaces all public.profiles RLS policies,
-- so first inspect the deployed policy list with:
--
-- SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'profiles'
-- ORDER BY policyname;
--
-- The local supabase_policies.sql does not show a recursive profiles lookup.
-- Live policies may differ. The migration below removes every existing policy
-- on public.profiles so no unknown permissive policy can continue to recurse.
-- Staff/admin profile reads and privileged edits remain server-side: backend
-- routes use the service-role client only after role/office authorization.

BEGIN;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy record;
  profile_column record;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.profiles',
      existing_policy.policyname
    );
  END LOOP;

  FOR profile_column IN
    SELECT attname
    FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.profiles FROM PUBLIC, anon, authenticated',
      profile_column.attname
    );
  END LOOP;
END
$$;

-- The frontend profile editor changes only full_name. Column-level grants
-- prevent clients from changing role, office_id, is_active, student_id, or
-- other protected columns, even if an RLS policy is later broadened.
REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, updated_at) ON TABLE public.profiles TO authenticated;

CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMIT;
