-- Backs the new /admin overview page with one aggregate query instead of pulling the full
-- students/leads tables client-side just to count rows in JS. Plain SECURITY INVOKER (the
-- default), same as get_retention_rate/get_today_activity_counts -- relies entirely on the
-- existing admin SELECT policies (20260817_users_admin_flag.sql,
-- 20261111_admin_can_view_free_lesson_leads.sql) for access control. A non-admin caller only
-- sees their own row through RLS, so every count below just reflects themselves -- not a
-- security concern, just not a useful call outside admin.

create or replace function public.get_admin_dashboard_stats()
returns table(
  total_students bigint,
  new_students_7d bigint,
  active_today bigint,
  active_7d bigint,
  reviews_today bigint,
  new_leads_7d bigint,
  leads_uncontacted bigint
)
language sql
stable
as $$
  select
    (select count(*) from public.users where admin = false) as total_students,
    (select count(*) from public.users
       where admin = false and created_at >= now() - interval '7 days') as new_students_7d,
    (select count(*) from public.leaderboard_stats ls join public.users u on u.id = ls.user_id
       where u.admin = false and ls.last_active_date = current_date) as active_today,
    (select count(*) from public.leaderboard_stats ls join public.users u on u.id = ls.user_id
       where u.admin = false and ls.last_active_date >= current_date - 6) as active_7d,
    (select coalesce(sum(lds.reviews_count), 0) from public.leaderboard_daily_stats lds join public.users u on u.id = lds.user_id
       where u.admin = false and lds.day = current_date) as reviews_today,
    (select count(*) from public.free_lesson_leads where created_at >= now() - interval '7 days') as new_leads_7d,
    (select count(*) from public.free_lesson_leads where contacted = false) as leads_uncontacted;
$$;

grant execute on function public.get_admin_dashboard_stats() to authenticated;
