-- Accounts and sync for Semester Calendar.
-- Apply with: npx supabase db push

-- 1. Each student's whole profile (setup + progress) as one JSON document.
create table if not exists public.student_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.student_data enable row level security;

-- Students can only see and change their own row.
create policy "read own data"   on public.student_data for select using (auth.uid() = user_id);
create policy "insert own data" on public.student_data for insert with check (auth.uid() = user_id);
create policy "update own data" on public.student_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own data" on public.student_data for delete using (auth.uid() = user_id);

-- 2. Only Queen's email addresses can create accounts.
--    To test with another address, drop this trigger:
--    drop trigger if exists queens_email_only on auth.users;
create or replace function public.check_queens_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not like '%@queensu.ca' then
    raise exception 'Please sign up with your Queen''s email address (@queensu.ca).';
  end if;
  return new;
end;
$$;

drop trigger if exists queens_email_only on auth.users;
create trigger queens_email_only
  before insert on auth.users
  for each row execute function public.check_queens_email();

-- 3. Upload limits: each syllabus or timetable read is recorded, and a student
--    can do at most `per_day` a day and `per_term` in any 120 days.
create table if not exists public.uploads (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists uploads_user_time on public.uploads (user_id, created_at);
alter table public.uploads enable row level security;
create policy "read own uploads" on public.uploads for select using (auth.uid() = user_id);

-- Returns 'ok', 'day' (daily limit reached) or 'term' (term limit reached).
-- Runs as the database owner so students can't insert rows directly.
create or replace function public.claim_upload(upload_kind text, per_day int default 20, per_term int default 40)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today_count int;
  term_count int;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select count(*) into today_count from public.uploads
    where user_id = uid and created_at >= date_trunc('day', now() at time zone 'America/Toronto') at time zone 'America/Toronto';
  if today_count >= per_day then return 'day'; end if;
  select count(*) into term_count from public.uploads
    where user_id = uid and created_at >= now() - interval '120 days';
  if term_count >= per_term then return 'term'; end if;
  insert into public.uploads (user_id, kind) values (uid, upload_kind);
  return 'ok';
end;
$$;

revoke all on function public.claim_upload(text, int, int) from public, anon;
grant execute on function public.claim_upload(text, int, int) to authenticated;
