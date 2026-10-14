-- Daily for iPhone: the server-driven Dynamic Island. Only the ios-push function (service role) touches these.
create table public.ios_devices (
  device_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  secret text not null,
  start_token text,
  activity_token text,
  schedule jsonb,
  updated_at timestamptz not null default now()
);
create index ios_devices_user on public.ios_devices (user_id);

-- One row per push sent (or being sent): a cron retry never shows a reminder twice. Pruned after 3 days.
create table public.ios_pushes (
  device_id uuid not null references public.ios_devices (device_id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (device_id, key)
);
create index ios_pushes_sent on public.ios_pushes (sent_at);

alter table public.ios_devices enable row level security;
alter table public.ios_pushes enable row level security;
-- No policies: anon and authenticated get nothing; the function uses the service role.
