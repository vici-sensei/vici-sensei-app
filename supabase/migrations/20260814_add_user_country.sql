-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Onboarding now asks users to pick their country, and it stays editable
-- afterwards from /settings/profile. countries is a small seeded reference
-- table (same read-only pattern as kanji/vocabulary: RLS enabled, SELECT
-- granted to authenticated only) rather than a hardcoded CHECK/array, so the
-- country dropdown can just `select * from countries` instead of duplicating
-- ~200 rows in the client bundle.
--
-- continent is NOT user-editable -- it's derived from country by the
-- sync_user_continent trigger below, which always recomputes it from
-- NEW.country and ignores whatever a client sends for continent. Column
-- grants reinforce this at the DB layer: only `country` is added to the
-- authenticated UPDATE grant (see 20260730_restrict_users_column_grants.sql),
-- so a direct PostgREST call can never set continent to an arbitrary value.
--
-- Kosovo (XK) is not an official ISO 3166-1 code but is widely used in
-- practice (EU, World Bank, Microsoft, payment processors) for users from
-- Kosovo -- included here for the same reason.

create table public.countries (
  code text primary key,
  name text not null,
  continent text not null,
  constraint countries_code_format_check check (code ~ '^[A-Z]{2}$'),
  constraint countries_continent_check check (
    continent = any (array['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'])
  )
);

alter table public.countries enable row level security;

create policy "Authenticated users can read countries" on public.countries
  for select
  to authenticated
  using (true);

insert into public.countries (code, name, continent) values
  -- Africa
  ('DZ', 'Algeria', 'Africa'),
  ('AO', 'Angola', 'Africa'),
  ('BJ', 'Benin', 'Africa'),
  ('BW', 'Botswana', 'Africa'),
  ('BF', 'Burkina Faso', 'Africa'),
  ('BI', 'Burundi', 'Africa'),
  ('CV', 'Cabo Verde', 'Africa'),
  ('CM', 'Cameroon', 'Africa'),
  ('CF', 'Central African Republic', 'Africa'),
  ('TD', 'Chad', 'Africa'),
  ('KM', 'Comoros', 'Africa'),
  ('CG', 'Congo', 'Africa'),
  ('CD', 'Congo (DRC)', 'Africa'),
  ('DJ', 'Djibouti', 'Africa'),
  ('EG', 'Egypt', 'Africa'),
  ('GQ', 'Equatorial Guinea', 'Africa'),
  ('ER', 'Eritrea', 'Africa'),
  ('SZ', 'Eswatini', 'Africa'),
  ('ET', 'Ethiopia', 'Africa'),
  ('GA', 'Gabon', 'Africa'),
  ('GM', 'Gambia', 'Africa'),
  ('GH', 'Ghana', 'Africa'),
  ('GN', 'Guinea', 'Africa'),
  ('GW', 'Guinea-Bissau', 'Africa'),
  ('CI', 'Ivory Coast', 'Africa'),
  ('KE', 'Kenya', 'Africa'),
  ('LS', 'Lesotho', 'Africa'),
  ('LR', 'Liberia', 'Africa'),
  ('LY', 'Libya', 'Africa'),
  ('MG', 'Madagascar', 'Africa'),
  ('MW', 'Malawi', 'Africa'),
  ('ML', 'Mali', 'Africa'),
  ('MR', 'Mauritania', 'Africa'),
  ('MU', 'Mauritius', 'Africa'),
  ('MA', 'Morocco', 'Africa'),
  ('MZ', 'Mozambique', 'Africa'),
  ('NA', 'Namibia', 'Africa'),
  ('NE', 'Niger', 'Africa'),
  ('NG', 'Nigeria', 'Africa'),
  ('RW', 'Rwanda', 'Africa'),
  ('ST', 'Sao Tome and Principe', 'Africa'),
  ('SN', 'Senegal', 'Africa'),
  ('SC', 'Seychelles', 'Africa'),
  ('SL', 'Sierra Leone', 'Africa'),
  ('SO', 'Somalia', 'Africa'),
  ('ZA', 'South Africa', 'Africa'),
  ('SS', 'South Sudan', 'Africa'),
  ('SD', 'Sudan', 'Africa'),
  ('TZ', 'Tanzania', 'Africa'),
  ('TG', 'Togo', 'Africa'),
  ('TN', 'Tunisia', 'Africa'),
  ('UG', 'Uganda', 'Africa'),
  ('ZM', 'Zambia', 'Africa'),
  ('ZW', 'Zimbabwe', 'Africa'),

  -- Asia
  ('AF', 'Afghanistan', 'Asia'),
  ('AM', 'Armenia', 'Asia'),
  ('AZ', 'Azerbaijan', 'Asia'),
  ('BH', 'Bahrain', 'Asia'),
  ('BD', 'Bangladesh', 'Asia'),
  ('BT', 'Bhutan', 'Asia'),
  ('BN', 'Brunei', 'Asia'),
  ('KH', 'Cambodia', 'Asia'),
  ('CN', 'China', 'Asia'),
  ('CY', 'Cyprus', 'Asia'),
  ('GE', 'Georgia', 'Asia'),
  ('IN', 'India', 'Asia'),
  ('ID', 'Indonesia', 'Asia'),
  ('IR', 'Iran', 'Asia'),
  ('IQ', 'Iraq', 'Asia'),
  ('IL', 'Israel', 'Asia'),
  ('JP', 'Japan', 'Asia'),
  ('JO', 'Jordan', 'Asia'),
  ('KZ', 'Kazakhstan', 'Asia'),
  ('KW', 'Kuwait', 'Asia'),
  ('KG', 'Kyrgyzstan', 'Asia'),
  ('LA', 'Laos', 'Asia'),
  ('LB', 'Lebanon', 'Asia'),
  ('MY', 'Malaysia', 'Asia'),
  ('MV', 'Maldives', 'Asia'),
  ('MN', 'Mongolia', 'Asia'),
  ('MM', 'Myanmar', 'Asia'),
  ('NP', 'Nepal', 'Asia'),
  ('KP', 'North Korea', 'Asia'),
  ('OM', 'Oman', 'Asia'),
  ('PK', 'Pakistan', 'Asia'),
  ('PH', 'Philippines', 'Asia'),
  ('QA', 'Qatar', 'Asia'),
  ('SA', 'Saudi Arabia', 'Asia'),
  ('SG', 'Singapore', 'Asia'),
  ('KR', 'South Korea', 'Asia'),
  ('LK', 'Sri Lanka', 'Asia'),
  ('SY', 'Syria', 'Asia'),
  ('TW', 'Taiwan', 'Asia'),
  ('TJ', 'Tajikistan', 'Asia'),
  ('TH', 'Thailand', 'Asia'),
  ('TL', 'Timor-Leste', 'Asia'),
  ('TR', 'Turkey', 'Asia'),
  ('TM', 'Turkmenistan', 'Asia'),
  ('AE', 'United Arab Emirates', 'Asia'),
  ('UZ', 'Uzbekistan', 'Asia'),
  ('VN', 'Vietnam', 'Asia'),
  ('YE', 'Yemen', 'Asia'),
  ('HK', 'Hong Kong', 'Asia'),
  ('MO', 'Macau', 'Asia'),
  ('PS', 'Palestine', 'Asia'),

  -- Europe
  ('AL', 'Albania', 'Europe'),
  ('AD', 'Andorra', 'Europe'),
  ('AT', 'Austria', 'Europe'),
  ('BY', 'Belarus', 'Europe'),
  ('BE', 'Belgium', 'Europe'),
  ('BA', 'Bosnia and Herzegovina', 'Europe'),
  ('BG', 'Bulgaria', 'Europe'),
  ('HR', 'Croatia', 'Europe'),
  ('CZ', 'Czech Republic', 'Europe'),
  ('DK', 'Denmark', 'Europe'),
  ('EE', 'Estonia', 'Europe'),
  ('FI', 'Finland', 'Europe'),
  ('FR', 'France', 'Europe'),
  ('DE', 'Germany', 'Europe'),
  ('GR', 'Greece', 'Europe'),
  ('HU', 'Hungary', 'Europe'),
  ('IS', 'Iceland', 'Europe'),
  ('IE', 'Ireland', 'Europe'),
  ('IT', 'Italy', 'Europe'),
  ('XK', 'Kosovo', 'Europe'),
  ('LV', 'Latvia', 'Europe'),
  ('LI', 'Liechtenstein', 'Europe'),
  ('LT', 'Lithuania', 'Europe'),
  ('LU', 'Luxembourg', 'Europe'),
  ('MT', 'Malta', 'Europe'),
  ('MD', 'Moldova', 'Europe'),
  ('MC', 'Monaco', 'Europe'),
  ('ME', 'Montenegro', 'Europe'),
  ('NL', 'Netherlands', 'Europe'),
  ('MK', 'North Macedonia', 'Europe'),
  ('NO', 'Norway', 'Europe'),
  ('PL', 'Poland', 'Europe'),
  ('PT', 'Portugal', 'Europe'),
  ('RO', 'Romania', 'Europe'),
  ('RU', 'Russia', 'Europe'),
  ('SM', 'San Marino', 'Europe'),
  ('RS', 'Serbia', 'Europe'),
  ('SK', 'Slovakia', 'Europe'),
  ('SI', 'Slovenia', 'Europe'),
  ('ES', 'Spain', 'Europe'),
  ('SE', 'Sweden', 'Europe'),
  ('CH', 'Switzerland', 'Europe'),
  ('UA', 'Ukraine', 'Europe'),
  ('GB', 'United Kingdom', 'Europe'),
  ('VA', 'Vatican City', 'Europe'),

  -- North America
  ('AG', 'Antigua and Barbuda', 'North America'),
  ('BS', 'Bahamas', 'North America'),
  ('BB', 'Barbados', 'North America'),
  ('BZ', 'Belize', 'North America'),
  ('CA', 'Canada', 'North America'),
  ('CR', 'Costa Rica', 'North America'),
  ('CU', 'Cuba', 'North America'),
  ('DM', 'Dominica', 'North America'),
  ('DO', 'Dominican Republic', 'North America'),
  ('SV', 'El Salvador', 'North America'),
  ('GD', 'Grenada', 'North America'),
  ('GT', 'Guatemala', 'North America'),
  ('HT', 'Haiti', 'North America'),
  ('HN', 'Honduras', 'North America'),
  ('JM', 'Jamaica', 'North America'),
  ('MX', 'Mexico', 'North America'),
  ('NI', 'Nicaragua', 'North America'),
  ('PA', 'Panama', 'North America'),
  ('KN', 'Saint Kitts and Nevis', 'North America'),
  ('LC', 'Saint Lucia', 'North America'),
  ('VC', 'Saint Vincent and the Grenadines', 'North America'),
  ('TT', 'Trinidad and Tobago', 'North America'),
  ('US', 'United States', 'North America'),

  -- South America
  ('AR', 'Argentina', 'South America'),
  ('BO', 'Bolivia', 'South America'),
  ('BR', 'Brazil', 'South America'),
  ('CL', 'Chile', 'South America'),
  ('CO', 'Colombia', 'South America'),
  ('EC', 'Ecuador', 'South America'),
  ('GY', 'Guyana', 'South America'),
  ('PY', 'Paraguay', 'South America'),
  ('PE', 'Peru', 'South America'),
  ('SR', 'Suriname', 'South America'),
  ('UY', 'Uruguay', 'South America'),
  ('VE', 'Venezuela', 'South America'),

  -- Oceania
  ('AU', 'Australia', 'Oceania'),
  ('FJ', 'Fiji', 'Oceania'),
  ('KI', 'Kiribati', 'Oceania'),
  ('MH', 'Marshall Islands', 'Oceania'),
  ('FM', 'Micronesia', 'Oceania'),
  ('NR', 'Nauru', 'Oceania'),
  ('NZ', 'New Zealand', 'Oceania'),
  ('PW', 'Palau', 'Oceania'),
  ('PG', 'Papua New Guinea', 'Oceania'),
  ('WS', 'Samoa', 'Oceania'),
  ('SB', 'Solomon Islands', 'Oceania'),
  ('TO', 'Tonga', 'Oceania'),
  ('TV', 'Tuvalu', 'Oceania'),
  ('VU', 'Vanuatu', 'Oceania');


alter table public.users
  add column country text references public.countries (code) on update cascade on delete set null,
  add column continent text;

grant update (country) on public.users to authenticated;


create or replace function public.sync_user_continent()
 returns trigger
 language plpgsql
as $function$
begin
  if new.country is null then
    new.continent := null;
  else
    select c.continent into new.continent
    from public.countries c
    where c.code = new.country;
  end if;
  return new;
end;
$function$;

create trigger sync_user_continent_trigger
  before insert or update on public.users
  for each row execute function public.sync_user_continent();


-- The four leaderboard RPCs (see 20260814_leaderboards.sql /
-- 20260814_leaderboard_include_zero_scores.sql) now also return country, so
-- the leaderboard can show a flag next to each entry. Adding a column to a
-- `returns table(...)` signature isn't something CREATE OR REPLACE allows
-- (Postgres errors: "cannot change return type of existing function"), so
-- each function is dropped and recreated instead.

drop function if exists public.get_leaderboard_reviews(timestamptz, integer, uuid);

create function public.get_leaderboard_reviews(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      u.country,
      count(r.id) as score
    from public.users u
    left join public.review_logs r on r.user_id = u.id and r.undone = false
      and (p_period_start is null or r.reviewed_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
    group by u.id, u.display_name, u.avatar_url, u.country
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_reviews(timestamptz, integer, uuid) to authenticated;


drop function if exists public.get_leaderboard_new_cards(timestamptz, integer, uuid);

create function public.get_leaderboard_new_cards(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with new_progress as (
    select user_id, created_at from public.user_kanji_meaning_progress
    union all
    select user_id, created_at from public.user_vocabulary_progress
  ),
  scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      u.country,
      count(np.*) as score
    from public.users u
    left join new_progress np on np.user_id = u.id
      and (p_period_start is null or np.created_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
    group by u.id, u.display_name, u.avatar_url, u.country
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_new_cards(timestamptz, integer, uuid) to authenticated;


drop function if exists public.get_leaderboard_xp(timestamptz, integer, uuid);

create function public.get_leaderboard_xp(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with review_points as (
    select user_id, sum(case when correct then 10 else 2 end) as points
    from public.review_logs
    where undone = false
      and (p_period_start is null or reviewed_at >= p_period_start)
    group by user_id
  ),
  new_card_points as (
    select user_id, count(*) * 25 as points
    from (
      select user_id, created_at from public.user_kanji_meaning_progress
      union all
      select user_id, created_at from public.user_vocabulary_progress
    ) np
    where p_period_start is null or np.created_at >= p_period_start
    group by user_id
  ),
  scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      u.country,
      coalesce(rp.points, 0) + coalesce(ncp.points, 0) as score
    from public.users u
    left join review_points rp on rp.user_id = u.id
    left join new_card_points ncp on ncp.user_id = u.id
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_xp(timestamptz, integer, uuid) to authenticated;


drop function if exists public.get_leaderboard_streak(integer, uuid);

create function public.get_leaderboard_streak(
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with active_days as (
    select distinct user_id, reviewed_at::date as d
    from public.review_logs
    where undone = false
  ),
  grp as (
    select user_id, d,
      d - (row_number() over (partition by user_id order by d))::integer as grp
    from active_days
  ),
  runs as (
    select user_id, max(d) as run_end, count(*) as run_len
    from grp
    group by user_id, grp
  ),
  scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      u.country,
      coalesce(r.run_len, 0) as score
    from public.users u
    left join runs r on r.user_id = u.id and r.run_end = current_date
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_streak(integer, uuid) to authenticated;
