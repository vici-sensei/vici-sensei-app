@AGENTS.md

## Database migrations

**Since 2026-09-22 there are THREE `public` schemas, not one** — see `supabase/MIGRATION_PARITY.md`
for the full picture and the per-migration scope table. Two different flows apply depending on which
project a migration targets:

- **`hmbemylaqnkiamvhcdcd` (eu-west-1, the original project) is FROZEN.** It's the read-only source
  of truth for the 8 original real users' history, but no new migration is ever applied there again —
  don't run anything against it beyond read-only verification queries.
- **`zrgcullndfhouencqqqc` (EU, eu-central-1) and `wftwdbiqnlqsvgpeypmb` (US, us-east-1) are the live
  projects** the app actually talks to (`NEXT_PUBLIC_MULTI_REGION=true` in production). Both need
  every schema change that applies to them — most migrations target both, some are region-specific by
  design (leaderboard replication, admin mirror). Check `MIGRATION_PARITY.md`'s table before writing
  one.

The whole pre-2026-09-22 schema history is ONE baseline file, `supabase/migrations/20260921000000_baseline.sql` (schema `public`, the hooks on `auth.users` / `storage.objects`, the `avatars` bucket row). The 296 older migrations live in `supabase/migrations_archive/` for reference only, renamed to unique 14-digit versions in their real order (old name -> new name in `supabase/migrations_archive/RENAME_MAP.csv`; comments inside files still mention the OLD names, look them up by the suffix after the prefix). They cannot rebuild the database: 13 of the 34 `public` tables were created before the first migration. Never edit them, never move them back into `supabase/migrations/`.

**Naming.** A new migration is `supabase/migrations/YYYYMMDDHHMMSS_short_snake_name.sql`: a 14-digit UTC timestamp taken from `date -u +%Y%m%d%H%M%S` at the moment you create the file, so it always sorts after every existing version. Never use a date-only prefix and never "last prefix + 1" (that scheme produced duplicate versions and invalid dates such as `20261232`). One file per change; fix mistakes in a NEW file, never by editing an applied one. Keep LF line endings (`.gitattributes` enforces it). Start the file with a one-line comment stating its scope (both live projects / EU only / US only) — `MIGRATION_PARITY.md`'s table is built from these.

**Applying — frozen project (`hmbemylaqnkiamvhcdcd`):** doesn't apply; nothing new is ever written for
it. If a migration file is ever needed for historical/reference reasons only, write it, tell the user,
and stop — never run it.

**Applying — EU-new / US-new (the live projects):** these are NOT the DBeaver-manual flow. With the
user's explicit go-ahead from Phases 4-6, Claude both writes the migration AND applies it directly,
once per target project (per `MIGRATION_PARITY.md`'s scope column):
- Try `psql -f <file>` against each target project (the CLI's `SUPABASE_ACCESS_TOKEN` has no access to
  this account/org — see `reference-supabase-cli-and-live-db` — so this is a direct `psql`, not
  `supabase db query`). The password comes from `pgpass.conf`, never typed/shown.
- The auto-mode classifier frequently blocks a `psql` write against a live database regardless of
  chat approval or an existing `settings.local.json` allow-rule (seen: "Modify Shared Resources",
  "Production Deploy"). When blocked, hand the user the exact SQL and ask them to run it in the
  Supabase SQL Editor (Dashboard) — fastest single-command path, faster than DBeaver here.
- After applying to a project, insert its ledger row there too (see Ledger below) — this does NOT
  happen automatically outside `supabase db push`, and post-baseline migrations applied this way have
  historically skipped it. Then update the scope table in `MIGRATION_PARITY.md`.
- **Never run `supabase db push`** against any of the three projects for anything beyond the very
  first baseline push into a brand-new empty project (see "New project" below) — the CLI's linked
  project is still the frozen one, so an unqualified push would target the wrong project entirely.

**Ledger.** `supabase_migrations.schema_migrations` records applied versions and must have one row per
migration file, per project it was applied to. On the frozen project: after the user applies something
manually (shouldn't normally happen — see above), remind them to record it via
`supabase migration repair --status applied <version> --linked` (the CLI IS linked to this project) or
an equivalent `insert`. On EU-new/US-new: there's no `--linked` access, so insert the row directly —
`insert into supabase_migrations.schema_migrations (version, name) values ('<version>', '<name>') on conflict (version) do nothing;` — same SQL-Editor-or-psql path as applying the migration itself.

**New project (clone).** `supabase db push --project-ref <NEW_REF>` on an EMPTY new project runs the
baseline and builds the schema (always pass `--project-ref` explicitly — this repo's CLI link is the
frozen project). Data, the vault secret, the `cron` job, Edge Functions, secrets, Auth settings, and
everything from Phases 2-7 (Worker/D1, auth hooks, Google OAuth, Stripe webhooks, leaderboard
replication, admin mirror) are not in migrations: follow `RESTORE.md` in the user's backup folder
(`Documents\vici-backups\`), including its multi-region section.
