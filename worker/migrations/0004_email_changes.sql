-- D1 schema for self-service email changes (docs/PASSWORD_AUTH_PLAN.md, phase 2). Applied with:
--   wrangler d1 execute vici-sensei-accounts --remote --file=worker/migrations/0004_email_changes.sql
--
-- The "Before User Created" hook only runs on signup, never when an existing account changes its
-- email, so without this the D1 `accounts` ledger would keep the OLD email and know nothing about
-- the new one -- the new address could then be claimed by the other region. One row = one change
-- the user has started (`start`) and not yet confirmed (`finalize`) or abandoned (`cancel`).
CREATE TABLE IF NOT EXISTS email_changes (
  user_id TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('eu', 'us')),
  old_key TEXT NOT NULL,
  new_key TEXT NOT NULL,
  -- 1 when WE inserted the `accounts` row for new_key (it was free). Only then may an abandoned
  -- change release it: if the row already existed, it belongs to whoever claimed it first.
  claimed_by_us INTEGER NOT NULL DEFAULT 0 CHECK (claimed_by_us IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, region)
);
