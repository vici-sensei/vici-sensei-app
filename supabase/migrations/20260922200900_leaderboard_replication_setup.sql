-- Phase 5 operational setup -- NOT applied identically to both projects, run the matching half
-- on each (this is the one piece that's genuinely per-region, alongside the pg_cron job below).
-- Run the EU block against the EU project, the US block against the US project.

-- ============ Run on vici-sensei-app-eu ============
-- CREATE PUBLICATION lb_export_eu FOR TABLE lb_export.eu_entries;
-- SELECT cron.schedule('lb-export-refresh', '*/5 * * * *', $$SELECT lb_export.refresh_entries('eu_entries')$$);
-- -- Needs the US project's password embedded (server-side replication connection, no way
-- -- around it -- see how worker's D1 PoC subscription was done, same reasoning):
-- CREATE SUBSCRIPTION lb_export_sub_us
--   CONNECTION 'host=db.wftwdbiqnlqsvgpeypmb.supabase.co port=5432 dbname=postgres user=postgres password=<US_PASSWORD> sslmode=require'
--   PUBLICATION lb_export_us;

-- ============ Run on vici-sensei-app-us ============
-- CREATE PUBLICATION lb_export_us FOR TABLE lb_export.us_entries;
-- SELECT cron.schedule('lb-export-refresh', '*/5 * * * *', $$SELECT lb_export.refresh_entries('us_entries')$$);
-- CREATE SUBSCRIPTION lb_export_sub_eu
--   CONNECTION 'host=db.zrgcullndfhouencqqqc.supabase.co port=5432 dbname=postgres user=postgres password=<EU_PASSWORD> sslmode=require'
--   PUBLICATION lb_export_eu;
