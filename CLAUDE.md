@AGENTS.md

## Database migrations

The live Supabase database is the source of truth. Its whole schema history is ONE baseline file, `supabase/migrations/20260921000000_baseline.sql` (schema `public`, the hooks on `auth.users` / `storage.objects`, the `avatars` bucket row). The 296 older migrations live in `supabase/migrations_archive/` for reference only, renamed to unique 14-digit versions in their real order (old name -> new name in `supabase/migrations_archive/RENAME_MAP.csv`; comments inside files still mention the OLD names, look them up by the suffix after the prefix). They cannot rebuild the database: 13 of the 34 `public` tables were created before the first migration. Never edit them, never move them back into `supabase/migrations/`.

**Naming.** A new migration is `supabase/migrations/YYYYMMDDHHMMSS_short_snake_name.sql`: a 14-digit UTC timestamp taken from `date -u +%Y%m%d%H%M%S` at the moment you create the file, so it always sorts after every existing version. Never use a date-only prefix and never "last prefix + 1" (that scheme produced duplicate versions and invalid dates such as `20261232`). One file per change; fix mistakes in a NEW file, never by editing an applied one. Keep LF line endings (`.gitattributes` enforces it).

**Applying.** Write the file, tell the user it is ready, and stop. The user runs migrations manually in DBeaver. Never run `supabase db push` against the live project. Only if the user explicitly asks you to run a specific file: `supabase db query --linked -f <file>`, then verify with a read-only query.

**Ledger.** `supabase_migrations.schema_migrations` records applied versions and must have one row per migration file. After the user applies a migration, remind them to record it: `supabase migration repair --status applied <version> --linked` (or an equivalent `insert` of `version` and `name`). Otherwise `supabase migration list --linked` drifts again.

**New project.** When the user asks for a clone, `supabase db push --project-ref <NEW_REF>` on an EMPTY new project runs the baseline and builds the schema. Data, the vault secret, the `cron` job, Edge Functions, secrets and Auth settings are not in migrations: follow `RESTORE.md` in the user's backup folder (`Documents\vici-backups\`). Always pass `--project-ref` explicitly; this repo is linked to the live project.
