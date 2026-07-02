-- Every experience (ranked or planned) carries the date it happened / is planned
-- for, independent of created_at (row insert time). Issue #49.
-- Rollback: alter table public.experiences drop column if exists experience_date;

alter table public.experiences
  add column if not exists experience_date date;

-- Backfill existing rows from their insert time.
update public.experiences
  set experience_date = created_at::date
  where experience_date is null;

-- Default so an omitted insert still succeeds (belt-and-suspenders alongside
-- client validation), then lock it down.
alter table public.experiences
  alter column experience_date set default current_date;

alter table public.experiences
  alter column experience_date set not null;
