-- D1 schema for the region-routing ledger (Phase 3). Applied with:
--   wrangler d1 execute vici-sensei-accounts --remote --file=worker/migrations/0001_init.sql
-- New changes go in a new numbered file (0002_..., ...) -- D1 has no equivalent of the Postgres
-- baseline in supabase/migrations/, so each file here is applied in order, like the archived
-- migrations used to be for the main DB.

-- The email->region ledger itself. `email_key` is the lowercased/trimmed email (see
-- worker/lib/region.ts's emailKey()), claimed atomically by the auth-hook endpoint the first
-- time an email is ever seen, by whichever region's "Before User Created" hook asks first.
CREATE TABLE IF NOT EXISTS accounts (
  email_key TEXT PRIMARY KEY,
  region TEXT NOT NULL CHECK (region IN ('eu', 'us')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Daily keep-alive results (both Free-plan projects pause after 7 days with no activity).
-- Log-only for now -- no outbound alert channel exists yet, query this table to check status.
CREATE TABLE IF NOT EXISTS keepalive_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL CHECK (region IN ('eu', 'us')),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  status_code INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Weekly reconciliation runs (accounts vs. each project's real auth.users, via the Admin API --
-- needs SUPABASE_SERVICE_ROLE_KEY_EU/US secrets that aren't set yet; the handler logs
-- 'skipped_no_secrets' and no-ops until they are).
CREATE TABLE IF NOT EXISTS reconciliation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL,
  detail TEXT
);
