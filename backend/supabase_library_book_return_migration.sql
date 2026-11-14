-- Atomic Library borrowing and return workflow.
-- Prepared for manual review and execution; this file is never run by the app.

BEGIN;

DO $preflight$
DECLARE
  v_constraint_definition text;
  v_status_values text[];
  v_column_type text;
  v_source_request_attnum smallint;
  v_source_request_unique boolean;
  v_service_office_id uuid;
  v_expected record;
BEGIN
  IF to_regclass('public.service_requests') IS NULL
     OR to_regclass('public.book_loans') IS NULL
     OR to_regclass('public.library_books') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.offices') IS NULL
     OR to_regclass('public.office_services') IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: a required Library workflow table is missing.';
  END IF;

  FOR v_expected IN
    SELECT * FROM (VALUES
      ('public.service_requests', 'student_id', 'uuid'),
      ('public.service_requests', 'service_id', 'uuid'),
      ('public.service_requests', 'book_id', 'uuid'),
      ('public.service_requests', 'status', 'text'),
      ('public.service_requests', 'title', 'text'),
      ('public.service_requests', 'handled_by', 'uuid'),
      ('public.service_requests', 'submitted_at', 'timestamp with time zone'),
      ('public.service_requests', 'updated_at', 'timestamp with time zone'),
      ('public.service_requests', 'completed_at', 'timestamp with time zone'),
      ('public.service_requests', 'expected_completion', 'date'),
      ('public.book_loans', 'book_id', 'uuid'),
      ('public.book_loans', 'student_id', 'uuid'),
      ('public.book_loans', 'issued_by', 'uuid'),
      ('public.book_loans', 'returned_to', 'uuid'),
      ('public.book_loans', 'borrowed_at', 'timestamp with time zone'),
      ('public.book_loans', 'due_at', 'timestamp with time zone'),
      ('public.book_loans', 'returned_at', 'timestamp with time zone'),
      ('public.book_loans', 'source_request_id', 'uuid'),
      ('public.book_loans', 'status', 'text'),
      ('public.library_books', 'id', 'uuid'),
      ('public.library_books', 'title', 'text'),
      ('public.library_books', 'total_copies', 'integer'),
      ('public.library_books', 'available_copies', 'integer'),
      ('public.library_books', 'is_active', 'boolean'),
      ('public.library_books', 'updated_at', 'timestamp with time zone'),
      ('public.profiles', 'id', 'uuid'),
      ('public.profiles', 'office_id', 'uuid'),
      ('public.offices', 'id', 'uuid'),
      ('public.offices', 'name', 'text'),
      ('public.offices', 'is_active', 'boolean'),
      ('public.office_services', 'id', 'uuid'),
      ('public.office_services', 'office_id', 'uuid'),
      ('public.office_services', 'name', 'text'),
      ('public.office_services', 'is_active', 'boolean')
    ) AS expected(table_name, column_name, expected_type)
  LOOP
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO v_column_type
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = v_expected.table_name::regclass
      AND a.attname = v_expected.column_name
      AND a.attnum > 0
      AND NOT a.attisdropped;
    IF v_column_type IS DISTINCT FROM v_expected.expected_type THEN
      RAISE EXCEPTION 'Preflight failed: %.% must be %, found %.',
        v_expected.table_name, v_expected.column_name, v_expected.expected_type, v_column_type;
    END IF;
  END LOOP;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_column_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.service_requests'::regclass
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_column_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Preflight failed: service_requests.id must be uuid; found %.', v_column_type;
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_column_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.service_requests'::regclass
    AND a.attname = 'status' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_column_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'Preflight failed: service_requests.status must be text; found %.', v_column_type;
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_column_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.book_loans'::regclass
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_column_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'Preflight failed: book_loans.id must be uuid; found %.', v_column_type;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.book_loans'::regclass
      AND a.attname IN ('book_id', 'student_id', 'issued_by', 'returned_to',
                        'borrowed_at', 'due_at', 'returned_at', 'status', 'source_request_id')
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY a.attrelid
    HAVING count(DISTINCT a.attname) = 9
  ) THEN
    RAISE EXCEPTION 'Preflight failed: required book_loans columns are missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.library_books'::regclass
      AND a.attname IN ('id', 'is_active', 'available_copies', 'total_copies', 'updated_at')
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY a.attrelid
    HAVING count(DISTINCT a.attname) = 5
  ) THEN
    RAISE EXCEPTION 'Preflight failed: required library_books columns are missing.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid)
  INTO v_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.service_requests'::regclass
    AND c.conname = 'service_requests_status_check'
    AND c.contype = 'c';
  IF v_constraint_definition IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: service_requests_status_check is missing.';
  END IF;

  SELECT array_agg(status_value ORDER BY status_value)
  INTO v_status_values
  FROM (
    SELECT DISTINCT captures.value[1] AS status_value
    FROM pg_catalog.regexp_matches(v_constraint_definition, '''([^'']+)''', 'g')
      AS captures(value)
  ) extracted;
  IF v_status_values IS DISTINCT FROM ARRAY[
    'borrowed', 'cancelled', 'claimed', 'completed',
    'pending', 'processing', 'ready_for_pickup', 'rejected'
  ]::text[] AND v_status_values IS DISTINCT FROM ARRAY[
    'borrowed', 'cancelled', 'claimed', 'completed',
    'confirmed', 'pending', 'processing', 'ready_for_pickup', 'rejected'
  ]::text[] THEN
    RAISE EXCEPTION 'Preflight failed: unexpected service_requests statuses: %', v_constraint_definition;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(c.oid)
  INTO v_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.book_loans'::regclass
    AND c.conname = 'book_loans_status_check'
    AND c.contype = 'c';
  IF v_constraint_definition IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: book_loans_status_check is missing.';
  END IF;

  SELECT array_agg(status_value ORDER BY status_value)
  INTO v_status_values
  FROM (
    SELECT DISTINCT captures.value[1] AS status_value
    FROM pg_catalog.regexp_matches(v_constraint_definition, '''([^'']+)''', 'g')
      AS captures(value)
  ) extracted;
  IF v_status_values IS DISTINCT FROM ARRAY[
    'borrowed', 'cancelled', 'rejected', 'requested', 'returned'
  ]::text[] THEN
    RAISE EXCEPTION 'Preflight failed: unexpected book_loans statuses: %', v_constraint_definition;
  END IF;

  SELECT a.attnum
  INTO v_source_request_attnum
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.book_loans'::regclass
    AND a.attname = 'source_request_id'
    AND a.attnum > 0 AND NOT a.attisdropped;
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = 'public.book_loans'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indnkeyatts = 1
      AND i.indkey[0] = v_source_request_attnum
      AND i.indpred IS NOT NULL
      AND pg_catalog.pg_get_expr(i.indpred, i.indrelid)
          ILIKE '%source_request_id IS NOT NULL%'
  )
  INTO v_source_request_unique;
  IF NOT v_source_request_unique THEN
    RAISE EXCEPTION 'Preflight failed: the unique partial source_request_id index is missing.';
  END IF;

  SELECT os.office_id
  INTO v_service_office_id
  FROM public.office_services os
  JOIN public.offices o ON o.id = os.office_id
  WHERE os.id = '99a740ad-96d7-43a5-9bcc-3f9723cabd28'::uuid
    AND o.name = 'Library';
  IF v_service_office_id IS NULL THEN
    RAISE EXCEPTION 'Preflight failed: the configured Library borrowing service ID is not in the Library office.';
  END IF;

  IF to_regprocedure('public.approve_library_borrow_request(uuid)') IS NULL
     OR pg_catalog.pg_get_function_result(
       to_regprocedure('public.approve_library_borrow_request(uuid)')
     ) IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'Preflight failed: expected approve_library_borrow_request(uuid) RETURNS void.';
  END IF;
  IF to_regprocedure('public.return_library_book(uuid)') IS NULL
     OR pg_catalog.pg_get_function_result(
       to_regprocedure('public.return_library_book(uuid)')
     ) IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'Preflight failed: expected return_library_book(uuid) RETURNS void.';
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_column_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.service_requests'::regclass
    AND a.attname = 'book_loan_id'
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_column_type IS NOT NULL AND v_column_type <> 'uuid' THEN
    RAISE EXCEPTION 'Preflight failed: service_requests.book_loan_id must be uuid; found %.', v_column_type;
  END IF;
END
$preflight$;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS book_loan_id uuid;

DO $add_book_loan_fk$
DECLARE
  v_request_column smallint;
  v_loan_column smallint;
  v_expected_fk boolean;
  v_named_fk boolean;
BEGIN
  SELECT a.attnum INTO v_request_column
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.service_requests'::regclass
    AND a.attname = 'book_loan_id' AND a.attnum > 0 AND NOT a.attisdropped;
  SELECT a.attnum INTO v_loan_column
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.book_loans'::regclass
    AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.service_requests'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.book_loans'::regclass
      AND c.conkey = ARRAY[v_request_column]::smallint[]
      AND c.confkey = ARRAY[v_loan_column]::smallint[]
  ) INTO v_expected_fk;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.service_requests'::regclass
      AND c.conname = 'service_requests_book_loan_id_fkey'
  ) INTO v_named_fk;

  IF v_expected_fk THEN
    NULL;
  ELSIF v_named_fk THEN
    RAISE EXCEPTION 'Preflight failed: service_requests_book_loan_id_fkey has an unexpected definition.';
  ELSE
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_book_loan_id_fkey
      FOREIGN KEY (book_loan_id)
      REFERENCES public.book_loans(id)
      NOT VALID;
  END IF;
END
$add_book_loan_fk$;

ALTER TABLE public.service_requests
  VALIDATE CONSTRAINT service_requests_book_loan_id_fkey;

DO $check_existing_return_requests$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_requests
    WHERE title ILIKE 'Book Return Request:%'
      AND status IN ('pending', 'processing')
      AND book_loan_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: active legacy return requests need verified book_loan_id links before migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_requests sr
    LEFT JOIN public.book_loans l ON l.id = sr.book_loan_id
    WHERE sr.title ILIKE 'Book Return Request:%'
      AND sr.status IN ('pending', 'processing')
      AND (
        l.id IS NULL
        OR l.student_id IS DISTINCT FROM sr.student_id
        OR l.book_id IS DISTINCT FROM sr.book_id
      )
  ) THEN
    RAISE EXCEPTION
      'Preflight failed: an active Book Return Request has a missing or mismatched loan, student, or book link.';
  END IF;

  IF EXISTS (
    SELECT book_loan_id
    FROM public.service_requests
    WHERE book_loan_id IS NOT NULL
      AND status IN ('pending', 'processing')
    GROUP BY book_loan_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Preflight failed: multiple active return requests already reference one loan.';
  END IF;

  IF to_regclass('public.service_requests_one_active_return_per_loan') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index i
       JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
       JOIN pg_catalog.pg_attribute a
         ON a.attrelid = i.indrelid
        AND a.attname = 'book_loan_id'
        AND a.attnum = i.indkey[0]
      WHERE idx.oid = to_regclass('public.service_requests_one_active_return_per_loan')         AND i.indrelid = 'public.service_requests'::regclass
         AND i.indisunique AND i.indisvalid AND i.indisready
         AND i.indnkeyatts = 1
         AND i.indpred IS NOT NULL
         AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) ILIKE '%book_loan_id IS NOT NULL%'
         AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) ILIKE '%pending%'
         AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) ILIKE '%processing%'
     ) THEN
    RAISE EXCEPTION 'Preflight failed: service_requests_one_active_return_per_loan has an unexpected definition.';
  END IF;
END
$check_existing_return_requests$;

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_one_active_return_per_loan
  ON public.service_requests (book_loan_id)
  WHERE book_loan_id IS NOT NULL
    AND status IN ('pending', 'processing');

ALTER TABLE public.service_requests
  DROP CONSTRAINT service_requests_status_check;

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'pending',
    'processing',
    'ready_for_pickup',
    'claimed',
    'borrowed',
    'completed',
    'rejected',
    'cancelled',
    'confirmed'
  )) NOT VALID;

ALTER TABLE public.service_requests
  VALIDATE CONSTRAINT service_requests_status_check;

CREATE OR REPLACE FUNCTION public.approve_library_borrow_request(
  p_request_id uuid,
  p_due_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_office_id uuid;
  v_library_office_id uuid;
  v_borrow_service_office_id uuid;
  v_request_student_id uuid;
  v_request_service_id uuid;
  v_request_book_id uuid;
  v_request_title text;
  v_request_status text;
  v_existing_loan_id uuid;
  v_existing_loan_book_id uuid;
  v_existing_loan_student_id uuid;
  v_existing_loan_status text;
  v_book_active boolean;
  v_available_copies integer;
  v_loan_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_updated_rows integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to approve a Library borrowing request.';
  END IF;
  IF p_request_id IS NULL OR p_due_at IS NULL OR p_due_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A request ID and future due date are required.';
  END IF;

  SELECT p.role::text, p.office_id
  INTO v_actor_role, v_actor_office_id
  FROM public.profiles p
  WHERE p.id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The authenticated user has no profile.';
  END IF;

  SELECT o.id INTO v_library_office_id
  FROM public.offices o
  WHERE o.name = 'Library';
  SELECT os.office_id INTO v_borrow_service_office_id
  FROM public.office_services os
  WHERE os.id = '99a740ad-96d7-43a5-9bcc-3f9723cabd28'::uuid;
  IF v_library_office_id IS NULL
     OR v_borrow_service_office_id IS DISTINCT FROM v_library_office_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The configured Library borrowing service is not assigned to the Library office.';
  END IF;
  IF v_actor_role IS DISTINCT FROM 'admin'
     AND (v_actor_role IS DISTINCT FROM 'staff'
          OR v_library_office_id IS NULL
          OR v_actor_office_id IS DISTINCT FROM v_library_office_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only Library staff or an admin may approve a borrowing request.';
  END IF;

  SELECT sr.student_id, sr.service_id, sr.book_id, sr.title, sr.status
  INTO v_request_student_id, v_request_service_id, v_request_book_id, v_request_title, v_request_status
  FROM public.service_requests sr
  WHERE sr.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Library borrowing request not found.';
  END IF;
  IF v_request_service_id IS DISTINCT FROM '99a740ad-96d7-43a5-9bcc-3f9723cabd28'::uuid
     OR v_request_title NOT LIKE 'Book Borrow Request:%'
     OR v_request_book_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The request is not a valid Library borrowing request with a selected book.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_request_student_id
      AND p.role::text = 'student'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The borrowing request does not belong to a student profile.';
  END IF;

  SELECT l.id, l.book_id, l.student_id, l.status::text
  INTO v_existing_loan_id, v_existing_loan_book_id, v_existing_loan_student_id, v_existing_loan_status
  FROM public.book_loans l
  WHERE l.source_request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing_loan_book_id IS DISTINCT FROM v_request_book_id
       OR v_existing_loan_student_id IS DISTINCT FROM v_request_student_id
       OR v_existing_loan_status NOT IN ('borrowed', 'returned') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The existing loan does not match this borrowing request.';
    END IF;
    IF v_request_status IN ('cancelled', 'rejected') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A cancelled or rejected request cannot be approved.';
    END IF;
    IF v_request_status IN ('pending', 'processing') THEN
      UPDATE public.service_requests
      SET status = 'confirmed',
          handled_by = v_actor_id,
          updated_at = v_now
      WHERE id = p_request_id
        AND status IN ('pending', 'processing');
    END IF;
    RETURN v_existing_loan_id;
  END IF;

  IF v_request_status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only a pending borrowing request can be issued.';
  END IF;

  SELECT b.is_active, b.available_copies
  INTO v_book_active, v_available_copies
  FROM public.library_books b
  WHERE b.id = v_request_book_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_book_active THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The selected Library book is missing or inactive.';
  END IF;
  IF v_available_copies IS NULL OR v_available_copies <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'No copies of the selected book are available.';
  END IF;

  UPDATE public.library_books
  SET available_copies = available_copies - 1,
      updated_at = v_now
  WHERE id = v_request_book_id
    AND is_active
    AND available_copies > 0;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The selected book is no longer available.';
  END IF;

  INSERT INTO public.book_loans (
    book_id, student_id, issued_by, borrowed_at, due_at, status, source_request_id
  )
  VALUES (
    v_request_book_id, v_request_student_id, v_actor_id, v_now, p_due_at, 'borrowed', p_request_id
  )
  RETURNING id INTO v_loan_id;

  UPDATE public.service_requests
  SET status = 'confirmed',
      handled_by = v_actor_id,
      updated_at = v_now
  WHERE id = p_request_id
    AND status IN ('pending', 'processing');
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The borrowing request changed during approval.';
  END IF;

  RETURN v_loan_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.create_library_return_request(
  p_loan_id uuid,
  p_return_service_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_student_id uuid;
  v_book_id uuid;
  v_loan_status text;
  v_returned_at timestamptz;
  v_book_title text;
  v_author text;
  v_isbn text;
  v_service_name text;
  v_service_active boolean;
  v_office_active boolean;
  v_request_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to request a Library book return.';
  END IF;
  IF p_loan_id IS NULL OR p_return_service_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22004', MESSAGE = 'A loan ID and Library return service ID are required.';
  END IF;

  SELECT p.role::text INTO v_actor_role
  FROM public.profiles p
  WHERE p.id = v_actor_id;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the student who owns the loan may request its return.';
  END IF;

  SELECT os.name, os.is_active, o.is_active
  INTO v_service_name, v_service_active, v_office_active
  FROM public.office_services os
  JOIN public.offices o ON o.id = os.office_id
  WHERE os.id = p_return_service_id
    AND os.id = '99a740ad-96d7-43a5-9bcc-3f9723cabd28'::uuid
    AND o.name = 'Library';
  IF NOT FOUND OR NOT v_service_active OR NOT v_office_active THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The Library return-request service is unavailable.';
  END IF;

  SELECT l.student_id, l.book_id, l.status::text, l.returned_at,
         b.title, b.author, b.isbn
  INTO v_student_id, v_book_id, v_loan_status, v_returned_at,
       v_book_title, v_author, v_isbn
  FROM public.book_loans l
  JOIN public.library_books b ON b.id = l.book_id
  WHERE l.id = p_loan_id
  FOR UPDATE OF l;
  IF NOT FOUND OR v_student_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The selected loan was not found for this student.';
  END IF;
  IF v_loan_status IS DISTINCT FROM 'borrowed' OR v_returned_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only a currently borrowed book can be returned.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.book_loan_id = p_loan_id
      AND sr.status IN ('pending', 'processing')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A return request for this book is already being processed.';
  END IF;

  INSERT INTO public.service_requests (
    student_id, service_id, book_id, book_loan_id, request_type, title,
    details, status, submitted_at, updated_at
  )
  VALUES (
    v_actor_id, p_return_service_id, v_book_id, p_loan_id, v_service_name,
    pg_catalog.format('Book Return Request: %s', v_book_title),
    pg_catalog.format(
      'Return request for loan %s. Book: %s. Author: %s. ISBN: %s.',
      p_loan_id,
      v_book_title,
      COALESCE(v_author, 'Not listed'),
      COALESCE(v_isbn, 'Not listed')
    ),
    'pending', v_now, v_now
  )
  ON CONFLICT (book_loan_id)
    WHERE book_loan_id IS NOT NULL
      AND status IN ('pending', 'processing')
  DO NOTHING
  RETURNING id INTO v_request_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A return request for this book is already being processed.';
  END IF;
  RETURN v_request_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.confirm_library_book_return(p_return_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_office_id uuid;
  v_library_office_id uuid;
  v_request_student_id uuid;
  v_request_book_id uuid;
  v_request_loan_id uuid;
  v_request_title text;
  v_request_status text;
  v_request_office_id uuid;
  v_loan_student_id uuid;
  v_loan_book_id uuid;
  v_loan_status text;
  v_loan_returned_at timestamptz;
  v_available_copies integer;
  v_total_copies integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_updated_rows integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required to confirm a Library book return.';
  END IF;
  IF p_return_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22004', MESSAGE = 'A return request ID is required.';
  END IF;

  SELECT p.role::text, p.office_id
  INTO v_actor_role, v_actor_office_id
  FROM public.profiles p
  WHERE p.id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The authenticated user has no profile.';
  END IF;
  SELECT o.id INTO v_library_office_id
  FROM public.offices o
  WHERE o.name = 'Library';
  IF v_actor_role IS DISTINCT FROM 'admin'
     AND (v_actor_role IS DISTINCT FROM 'staff'
          OR v_library_office_id IS NULL
          OR v_actor_office_id IS DISTINCT FROM v_library_office_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only Library staff or an admin may confirm a book return.';
  END IF;

  SELECT sr.student_id, sr.book_id, sr.book_loan_id, sr.title, sr.status, os.office_id
  INTO v_request_student_id, v_request_book_id, v_request_loan_id,
       v_request_title, v_request_status, v_request_office_id
  FROM public.service_requests sr
  JOIN public.office_services os ON os.id = sr.service_id
  WHERE sr.id = p_return_request_id
  FOR UPDATE OF sr;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Library return request not found.';
  END IF;
  IF v_request_title NOT LIKE 'Book Return Request:%'
     OR v_request_loan_id IS NULL
     OR v_request_book_id IS NULL
     OR v_request_office_id IS DISTINCT FROM v_library_office_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The request is not a valid linked Library book return request.';
  END IF;
  IF v_request_status NOT IN ('pending', 'processing', 'completed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The return request is not awaiting Library review.';
  END IF;

  SELECT l.student_id, l.book_id, l.status::text, l.returned_at
  INTO v_loan_student_id, v_loan_book_id, v_loan_status, v_loan_returned_at
  FROM public.book_loans l
  WHERE l.id = v_request_loan_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The linked book loan was not found.';
  END IF;
  IF v_loan_student_id IS DISTINCT FROM v_request_student_id
     OR v_loan_book_id IS DISTINCT FROM v_request_book_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The return request does not match the linked loan.';
  END IF;

  IF v_request_status = 'completed' THEN
    IF v_loan_status = 'returned' AND v_loan_returned_at IS NOT NULL THEN
      RETURN false;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The completed return request does not match a returned loan.';
  END IF;

  IF v_loan_status = 'returned' AND v_loan_returned_at IS NOT NULL THEN
    -- Recover a return committed by the previous RPC before its request update.
    UPDATE public.service_requests
    SET status = 'completed',
        handled_by = v_actor_id,
        completed_at = COALESCE(completed_at, v_loan_returned_at),
        updated_at = v_now
    WHERE id = p_return_request_id
      AND status IN ('pending', 'processing');
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The return request changed while being finalized.';
    END IF;
    RETURN true;
  END IF;
  IF v_loan_status IS DISTINCT FROM 'borrowed' OR v_loan_returned_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only a currently borrowed book can be returned.';
  END IF;

  SELECT b.available_copies, b.total_copies
  INTO v_available_copies, v_total_copies
  FROM public.library_books b
  WHERE b.id = v_loan_book_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The linked Library book was not found.';
  END IF;
  IF v_available_copies IS NULL OR v_total_copies IS NULL
     OR v_available_copies >= v_total_copies THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Available-copy inventory is inconsistent for this return.';
  END IF;

  UPDATE public.book_loans
  SET status = 'returned',
      returned_at = v_now,
      returned_to = v_actor_id
  WHERE id = v_request_loan_id
    AND status = 'borrowed'
    AND returned_at IS NULL;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The loan changed while its return was being processed.';
  END IF;

  UPDATE public.library_books
  SET available_copies = available_copies + 1,
      updated_at = v_now
  WHERE id = v_loan_book_id
    AND available_copies < total_copies;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The available copy could not be restored.';
  END IF;

  UPDATE public.service_requests
  SET status = 'completed',
      handled_by = v_actor_id,
      completed_at = v_now,
      updated_at = v_now
  WHERE id = p_return_request_id
    AND status IN ('pending', 'processing');
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The return request changed while being completed.';
  END IF;

  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.return_library_book(p_loan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '0A000',
    MESSAGE = 'Direct loan returns are disabled. Confirm the linked Library return request instead.';
END
$function$;

-- Disable the former one-step RPCs; the old return function must not mutate
-- inventory or the borrowing request outside the linked return-request flow.
REVOKE ALL ON FUNCTION public.approve_library_borrow_request(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.return_library_book(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_library_borrow_request(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_library_return_request(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_library_book_return(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.approve_library_borrow_request(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_library_return_request(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_library_book_return(uuid) TO authenticated;

COMMENT ON FUNCTION public.approve_library_borrow_request(uuid, timestamptz) IS
  'Atomically issues one Library book loan, decrements one available copy, and confirms the borrowing request.';
COMMENT ON FUNCTION public.confirm_library_book_return(uuid) IS
  'Atomically confirms a linked Library return request, returns the loan, and increments one available copy.';
COMMENT ON FUNCTION public.create_library_return_request(uuid, uuid) IS
  'Creates one return request for the authenticated student and their currently borrowed Library loan.';

COMMIT;

-- Deployment: review and apply this transaction manually before deploying the
-- backend that calls the new RPC signatures.
-- Rollback: on any pre-COMMIT error, the transaction is rolled back. After
-- COMMIT, use a separately reviewed rollback migration; never restore the old
-- return function because it changes the original borrowing request.
