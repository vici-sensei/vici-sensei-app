-- One-time backfill: fill frequency_number from frequency_number_estimated
-- for rows where the real frequency rank hasn't been assigned yet.
-- Safe to re-run: only touches rows that are still null.

update public.vocabulary
set frequency_number = frequency_number_estimated
where frequency_number is null
  and frequency_number_estimated is not null;
