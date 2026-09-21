-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- user_kanji_meaning_progress/user_kanji_reading_progress/user_vocabulary_progress/
-- user_study_settings updates all stamped updated_at with a client new Date().toISOString()
-- (lib/data/reviews.ts, lib/data/cards.ts, lib/client-data/studySettings.ts). Same class of
-- issue as 20260815_auto_users_updated_at.sql already fixed for public.users -- add a
-- generic version of that trigger (that one's set_users_updated_at() is scoped to users only)
-- and attach it here too. review_logs/study_sessions have no updated_at column -- nothing to do.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger set_updated_at_trigger
before update on public.user_kanji_meaning_progress
for each row execute function public.set_updated_at();

create trigger set_updated_at_trigger
before update on public.user_kanji_reading_progress
for each row execute function public.set_updated_at();

create trigger set_updated_at_trigger
before update on public.user_vocabulary_progress
for each row execute function public.set_updated_at();

create trigger set_updated_at_trigger
before update on public.user_study_settings
for each row execute function public.set_updated_at();
