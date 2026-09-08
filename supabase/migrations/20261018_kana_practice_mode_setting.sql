-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lets a kana-track student opt into a "Practice" nudge on the dashboard once they're done for
-- the day (see DashboardHero's Practice button, which links to /study/practice). Purely a
-- display preference read by the settings form and the dashboard button -- nothing server-side
-- depends on it, so a plain column (no trigger, no RPC change) is enough.

alter table public.user_study_settings
  add column kana_practice_enabled boolean not null default false;
