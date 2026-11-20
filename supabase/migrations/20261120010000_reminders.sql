-- Push reminders.

-- Each device a student turned reminders on for.
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "read own subscriptions"   on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "add own subscriptions"    on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "update own subscriptions" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "remove own subscriptions" on public.push_subscriptions for delete using (auth.uid() = user_id);

-- Reminders already sent, so none goes out twice. Only the server writes here.
create table if not exists public.reminder_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  key      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, day, key)
);
alter table public.reminder_log enable row level security;
