-- D1 schema for self-service region moves. Applied with:
--   wrangler d1 execute vici-sensei-accounts --remote --file=worker/migrations/0003_region_moves.sql
--
-- One row tracks one in-flight (or completed) move for one email. The columns ARE the resume
-- state -- runNextStep() in worker/lib/regionMove.ts branches on which columns are still
-- unset/zero, never on `status` (that field is display-only). A crash/timeout mid-move just means
-- the next call to /continue picks up exactly where the last one left off.
CREATE TABLE IF NOT EXISTS region_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_key TEXT NOT NULL,
  -- The real, as-verified-by-GoTrue email (case as auth.users stored it) -- email_key is
  -- lowercased/trimmed for ledger matching and must NOT be used to create the target auth user.
  email TEXT NOT NULL,
  source_region TEXT NOT NULL CHECK (source_region IN ('eu', 'us')),
  target_region TEXT NOT NULL CHECK (target_region IN ('eu', 'us')),
  source_user_id TEXT NOT NULL,
  target_user_id TEXT,
  profile_synced INTEGER NOT NULL DEFAULT 0,
  current_table TEXT,                 -- next table to drain in COPY_TABLES order; NULL = all done
  avatar_done INTEGER NOT NULL DEFAULT 0,
  stripe_done INTEGER NOT NULL DEFAULT 0,
  ledger_updated INTEGER NOT NULL DEFAULT 0,
  source_retired INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'started',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- At most one in-flight (non-completed) move per email at a time.
CREATE UNIQUE INDEX IF NOT EXISTS region_moves_active_email
  ON region_moves(email_key) WHERE status <> 'completed';

CREATE TABLE IF NOT EXISTS region_move_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  move_id INTEGER NOT NULL,
  step TEXT NOT NULL,
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  detail TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
