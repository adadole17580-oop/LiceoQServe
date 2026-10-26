-- ====================================================================
-- LiceoQServe: Non-Destructive Row Level Security (RLS) Policies
-- Preserves all existing records (18 office services, 3 rooms, etc.)
-- ====================================================================

-- 1. Enable RLS on master tables if not already enabled
ALTER TABLE IF EXISTS public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.office_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.office_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.school_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.queue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.book_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.library_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.service_history ENABLE ROW LEVEL SECURITY;

-- 2. Master Tables: Allow authenticated and anon read of active records
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read active offices') THEN
    CREATE POLICY "Allow public read active offices" ON public.offices
      FOR SELECT USING (is_active = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read active services') THEN
    CREATE POLICY "Allow public read active services" ON public.office_services
      FOR SELECT USING (is_active = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read active rooms') THEN
    CREATE POLICY "Allow public read active rooms" ON public.rooms
      FOR SELECT USING (is_available = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read active books') THEN
    CREATE POLICY "Allow public read active books" ON public.library_books
      FOR SELECT USING (is_active = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read schedules') THEN
    CREATE POLICY "Allow public read schedules" ON public.office_schedules
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read school events') THEN
    CREATE POLICY "Allow public read school events" ON public.school_events
      FOR SELECT USING (true);
  END IF;
END $$;

-- 3. Profiles: Users can read only their own profile.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
  CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

  DROP POLICY IF EXISTS "Users can update own personal profile" ON public.profiles;
  CREATE POLICY "Users can update own personal profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id AND role = 'student' AND office_id IS NULL)
    WITH CHECK (auth.uid() = id AND role = 'student' AND office_id IS NULL);

  DROP POLICY IF EXISTS "Students can insert own student profile" ON public.profiles;
  CREATE POLICY "Students can insert own student profile" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id AND role = 'student' AND office_id IS NULL);
END $$;

-- 4. Queues: Students can read only their own tickets. Mutations go through the backend.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Students can read own or public tickets" ON public.queues;
  DROP POLICY IF EXISTS "Students can cancel own queue ticket" ON public.queues;
  DROP POLICY IF EXISTS "Students can read own queue tickets" ON public.queues;
  CREATE POLICY "Students can read own queue tickets" ON public.queues
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());
END $$;

-- 5. Appointments, Requests, Reservations, Loans, Clearances: Student reads own
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students read own appointments') THEN
    CREATE POLICY "Students read own appointments" ON public.appointments
      FOR SELECT TO authenticated USING (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students read own requests') THEN
    CREATE POLICY "Students read own requests" ON public.service_requests
      FOR SELECT TO authenticated USING (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students read own reservations') THEN
    CREATE POLICY "Students read own reservations" ON public.reservations
      FOR SELECT TO authenticated USING (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students read own book loans') THEN
    CREATE POLICY "Students read own book loans" ON public.book_loans
      FOR SELECT TO authenticated USING (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students read own clearances') THEN
    CREATE POLICY "Students read own clearances" ON public.library_clearances
      FOR SELECT TO authenticated USING (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students read own history') THEN
    CREATE POLICY "Students read own history" ON public.service_history
      FOR SELECT TO authenticated USING (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students read own notifications') THEN
    CREATE POLICY "Students read own notifications" ON public.notifications
      FOR SELECT TO authenticated USING (recipient_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students update own notifications') THEN
    CREATE POLICY "Students update own notifications" ON public.notifications
      FOR UPDATE TO authenticated
      USING (recipient_id = auth.uid())
      WITH CHECK (recipient_id = auth.uid());
  END IF;
END $$;
