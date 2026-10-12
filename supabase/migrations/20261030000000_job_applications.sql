-- Careers applications (/careers/[roleId]) and the recruiting dashboard (/admin/recruiting).
--
-- Applicants never sign in: POST /api/careers/applications validates the form and writes the row
-- and the resume with the service role. Only Click admins (app_metadata.role = 'admin', which only
-- the service role can set) can read applications, resumes and their history. Admins change an
-- application only through the two RPCs below, which check the role, compare-and-set against what
-- the admin last saw, and append the history row in the same transaction.

-- ---------------------------------------------------------------------------
-- 1. Admin check from the verified JWT (mirrors lib/server/adminRole.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Applications: applicant answers (written once) + review state (status, notes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position text NOT NULL CHECK (position ~ '^[a-z0-9-]{1,64}$'),

    -- Submitted by the applicant.
    full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
    email text NOT NULL CHECK (char_length(email) <= 254 AND email ~* '^[^@[:space:]]+@uw\.edu$'),
    school_year text NOT NULL CHECK (school_year IN ('freshman', 'sophomore', 'junior', 'senior', 'graduate', 'other')),
    majors text NOT NULL CHECK (char_length(majors) BETWEEN 1 AND 200),
    graduation_quarter text NOT NULL CHECK (graduation_quarter IN ('autumn', 'winter', 'spring', 'summer')),
    graduation_year smallint NOT NULL CHECK (graduation_year BETWEEN 2024 AND 2040),
    weekly_hours text NOT NULL CHECK (weekly_hours IN ('under_5', '5_10', '10_15', '15_plus')),
    start_date date NOT NULL,
    interests text[] NOT NULL CHECK (cardinality(interests) BETWEEN 1 AND 12),
    experience text CHECK (char_length(experience) <= 4000),
    links text CHECK (char_length(links) <= 1000),
    pitch text NOT NULL CHECK (char_length(pitch) BETWEEN 1 AND 2000),
    tried_click text NOT NULL CHECK (tried_click IN ('ios_beta', 'want_to', 'no')),
    referral_source text NOT NULL CHECK (referral_source IN ('ed_discussion', 'friend', 'social_media', 'club', 'other')),
    additional_info text CHECK (char_length(additional_info) <= 2000),
    resume_path text NOT NULL UNIQUE,
    resume_name text NOT NULL CHECK (char_length(resume_name) BETWEEN 1 AND 200),
    resume_type text NOT NULL CHECK (resume_type IN (
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )),
    resume_size integer NOT NULL CHECK (resume_size BETWEEN 1 AND 10485760),
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Managed by admins through the RPCs below.
    status text NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'under_review', 'shortlisted', 'interview', 'accepted', 'rejected')),
    notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 10000),
    notes_updated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- One application per person per role; a second submission is answered with "already applied".
CREATE UNIQUE INDEX IF NOT EXISTS job_applications_position_email_key
    ON public.job_applications (position, lower(email));
CREATE INDEX IF NOT EXISTS job_applications_position_created_idx
    ON public.job_applications (position, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS job_applications_position_status_created_idx
    ON public.job_applications (position, status, created_at DESC);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_applications FROM anon, authenticated;
GRANT SELECT ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

DROP POLICY IF EXISTS job_applications_admin_select ON public.job_applications;
CREATE POLICY job_applications_admin_select ON public.job_applications
    FOR SELECT TO authenticated
    USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Append-only history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_application_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id uuid NOT NULL REFERENCES public.job_applications (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('submitted', 'status_changed', 'notes_updated')),
    from_status text,
    to_status text,
    -- NULL actor = the applicant.
    actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    actor_email text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_application_events_application_idx
    ON public.job_application_events (application_id, created_at, id);

ALTER TABLE public.job_application_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_application_events FROM anon, authenticated;
GRANT SELECT ON public.job_application_events TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.job_application_events TO service_role;

DROP POLICY IF EXISTS job_application_events_admin_select ON public.job_application_events;
CREATE POLICY job_application_events_admin_select ON public.job_application_events
    FOR SELECT TO authenticated
    USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.job_application_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'job_application_events is append-only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS job_application_events_no_update ON public.job_application_events;
CREATE TRIGGER job_application_events_no_update
    BEFORE UPDATE ON public.job_application_events
    FOR EACH ROW EXECUTE FUNCTION public.job_application_events_append_only();

CREATE OR REPLACE FUNCTION public.job_applications_log_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.job_application_events (application_id, kind, to_status, created_at)
    VALUES (NEW.id, 'submitted', NEW.status, NEW.created_at);
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.job_applications_log_submitted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_applications_log_submitted ON public.job_applications;
CREATE TRIGGER job_applications_log_submitted
    AFTER INSERT ON public.job_applications
    FOR EACH ROW EXECUTE FUNCTION public.job_applications_log_submitted();

-- ---------------------------------------------------------------------------
-- 4. Admin RPCs. 42501 = not an admin, P0002 = no such application, PT409 (HTTP 409; never 40001, which PostgREST retries) = someone else changed
--    it since the admin loaded it (the caller refreshes and tries again).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_job_application_status(
    p_application_id uuid,
    p_from text,
    p_to text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated_at timestamptz;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.job_applications a
    SET status = p_to,
        updated_at = now()
    WHERE a.id = p_application_id
      AND a.status = p_from
    RETURNING a.updated_at INTO v_updated_at;

    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.job_applications a WHERE a.id = p_application_id) THEN
            RAISE EXCEPTION 'application changed' USING ERRCODE = 'PT409';
        END IF;
        RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_from IS DISTINCT FROM p_to THEN
        INSERT INTO public.job_application_events (application_id, kind, from_status, to_status, actor_id, actor_email)
        VALUES (p_application_id, 'status_changed', p_from, p_to, auth.uid(), auth.jwt() ->> 'email');
    END IF;

    RETURN v_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_job_application_notes(
    p_application_id uuid,
    p_notes text,
    p_expected_notes_updated_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_notes_updated_at timestamptz;
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.job_applications a
    SET notes = p_notes,
        notes_updated_at = now(),
        updated_at = now()
    WHERE a.id = p_application_id
      AND a.notes_updated_at IS NOT DISTINCT FROM p_expected_notes_updated_at
    RETURNING a.notes_updated_at INTO v_notes_updated_at;

    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM public.job_applications a WHERE a.id = p_application_id) THEN
            RAISE EXCEPTION 'application changed' USING ERRCODE = 'PT409';
        END IF;
        RAISE EXCEPTION 'application not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.job_application_events (application_id, kind, actor_id, actor_email)
    VALUES (p_application_id, 'notes_updated', auth.uid(), auth.jwt() ->> 'email');

    RETURN v_notes_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.job_application_status_counts(p_position text)
RETURNS TABLE (status text, total bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    -- SECURITY INVOKER: RLS returns no rows to non-admins.
    SELECT a.status, count(*)
    FROM public.job_applications a
    WHERE a.position = p_position
    GROUP BY a.status;
$$;

REVOKE ALL ON FUNCTION public.set_job_application_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_job_application_notes(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.job_application_status_counts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_job_application_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_job_application_notes(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.job_application_status_counts(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private resume bucket: service role writes, admins read (signed URLs), nobody else.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'job-application-resumes',
    'job-application-resumes',
    false,
    10485760,
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS job_application_resumes_admin_select ON storage.objects;
CREATE POLICY job_application_resumes_admin_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'job-application-resumes' AND public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. Recruiting admin. Granted only to a verified sign-in for this address; if the account does
--    not exist yet, sign in once (Continue with Google) and run:
--      supabase auth admin update-user --user-id <id> --app-metadata '{"role":"admin"}'
--    The role reaches the JWT on the next sign-in or token refresh.
-- ---------------------------------------------------------------------------
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
WHERE lower(email) = 'click.us.platforms@gmail.com'
  AND email_confirmed_at IS NOT NULL
  AND coalesce(raw_app_meta_data ->> 'role', '') <> 'admin';

NOTIFY pgrst, 'reload schema';
