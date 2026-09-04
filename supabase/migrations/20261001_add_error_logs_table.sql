-- Archive of client-side errors, one row per error the app catches. Written from the browser
-- via the anon/authenticated Postgrest role (see lib/client-data/errorLog.ts), so RLS is the
-- only thing standing between a buggy or malicious client and this table.
--
-- No FK to auth.users (matches account_deletion_log's user_id, and every other user_id column
-- in this schema) -- a deleted user's error history is still worth keeping for debugging, so
-- user_id is left nullable rather than ON DELETE CASCADE/SET NULL wired up.

CREATE TABLE public.error_logs (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	user_id uuid NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	source text NOT NULL,
	error_name text NULL,
	message text NOT NULL,
	stack text NULL,
	digest text NULL,
	page_path text NULL,
	previous_page_path text NULL,
	breadcrumbs jsonb NULL,
	context jsonb NULL,
	user_agent text NULL,
	CONSTRAINT error_logs_pkey PRIMARY KEY (id),
	CONSTRAINT error_logs_source_check CHECK ((source = ANY (ARRAY['react_error_boundary'::text, 'global_error_boundary'::text, 'window_error'::text, 'unhandled_rejection'::text, 'manual'::text])))
);
CREATE INDEX idx_error_logs_user_created ON public.error_logs USING btree (user_id, created_at);
CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at);

COMMENT ON TABLE public.error_logs IS 'Archive of client-side app errors for debugging -- who hit it, what page, what led up to it.';
COMMENT ON COLUMN public.error_logs.user_id IS 'Signed-in user who hit the error. Null is possible if a session expires mid-request.';
COMMENT ON COLUMN public.error_logs.source IS 'Capture mechanism: react_error_boundary (app/error.tsx), global_error_boundary (app/global-error.tsx), window_error (uncaught script error), unhandled_rejection (uncaught promise rejection), or manual (explicit logClientError call from app code).';
COMMENT ON COLUMN public.error_logs.page_path IS 'pathname + search of the page the error surfaced on.';
COMMENT ON COLUMN public.error_logs.previous_page_path IS 'pathname of the last page the user visited before this one -- what they were doing right before the error.';
COMMENT ON COLUMN public.error_logs.breadcrumbs IS 'Ordered [{at, path}] trail of recent page visits this session, most recent last.';
COMMENT ON COLUMN public.error_logs.context IS 'Free-form extra detail from the call site (component name, request payload, etc).';

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Table Policies

-- Every other table in this schema restricts writes to `authenticated` only (no policy in the
-- whole schema grants anything to `anon`) -- matched here rather than opening a new anon-write
-- surface. A user can only ever log an error as themselves, never on another user's behalf.
CREATE POLICY "Users can insert own error_logs" ON public.error_logs
 AS PERMISSIVE
 FOR INSERT
 TO authenticated
 WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

-- Nobody gets a SELECT/UPDATE/DELETE policy other than admins -- this is a write-only archive
-- from the app's point of view. Mirrors the inline admin check already used for leaderboard
-- visibility (see 20260817_users_admin_flag.sql) since there's no shared is_admin() helper yet.
CREATE POLICY "Admins can view error_logs" ON public.error_logs
 AS PERMISSIVE
 FOR SELECT
 TO authenticated
 USING (COALESCE((SELECT admin FROM public.users WHERE id = (SELECT auth.uid())), false));
