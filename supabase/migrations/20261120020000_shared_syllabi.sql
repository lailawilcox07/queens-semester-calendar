-- Shared syllabi: once a student has checked a syllabus, others taking the same
-- course in the same term can pick it from a list instead of uploading their own.
-- Only the course, instructor and graded work are shared, never who shared it.

create table if not exists public.shared_syllabi (
  id           bigint generated always as identity primary key,
  term_id      text not null,            -- e.g. 'W2027'
  term_end     date not null,            -- last exam day; hidden two weeks after
  course_code  text not null,            -- e.g. 'CISC 124'
  course_name  text,
  instructor   text not null,
  assessments  jsonb not null,           -- [{ name, type, due, weight, note }]
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  uses         int not null default 0,
  reports      int not null default 0
);
create index if not exists shared_syllabi_lookup on public.shared_syllabi (term_id, course_code);
alter table public.shared_syllabi enable row level security;

-- Signed-in students see syllabi for terms that haven't finished (plus two
-- weeks), and not ones several students have reported as wrong.
create policy "see current shared syllabi" on public.shared_syllabi
  for select to authenticated
  using (term_end >= current_date - 14 and reports < 3);
create policy "share a syllabus" on public.shared_syllabi
  for insert to authenticated
  with check (created_by = auth.uid() and term_end >= current_date - 14);
create policy "change own shared syllabus" on public.shared_syllabi
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "remove own shared syllabus" on public.shared_syllabi
  for delete to authenticated using (created_by = auth.uid());

-- Counting uses, and one report per student.
create table if not exists public.shared_syllabus_reports (
  syllabus_id bigint not null references public.shared_syllabi (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  primary key (syllabus_id, user_id)
);
alter table public.shared_syllabus_reports enable row level security;

create or replace function public.use_shared_syllabus(sid bigint)
returns void language sql security definer set search_path = '' as $$
  update public.shared_syllabi set uses = uses + 1 where id = sid and auth.uid() is not null;
$$;

create or replace function public.report_shared_syllabus(sid bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.shared_syllabus_reports (syllabus_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  update public.shared_syllabi
    set reports = (select count(*) from public.shared_syllabus_reports where syllabus_id = sid)
    where id = sid;
end;
$$;

revoke all on function public.use_shared_syllabus(bigint) from public, anon;
revoke all on function public.report_shared_syllabus(bigint) from public, anon;
grant execute on function public.use_shared_syllabus(bigint) to authenticated;
grant execute on function public.report_shared_syllabus(bigint) to authenticated;
