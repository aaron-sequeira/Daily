-- Daily Plus: entitlement cache and AI quotas. Only the daily-ai function (service role) touches these.
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plus boolean not null,
  expires_at timestamptz,
  checked_at timestamptz not null default now()
);

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

alter table public.entitlements enable row level security;
alter table public.ai_usage enable row level security;

-- Takes one slot in `bucket` if fewer than `p_limit` are used; true when it did. Atomic under concurrency.
create function public.use_ai(p_user uuid, p_bucket text, p_limit integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare taken integer;
begin
  insert into public.ai_usage (user_id, bucket, count) values (p_user, p_bucket, 1)
  on conflict (user_id, bucket) do update set count = public.ai_usage.count + 1, updated_at = now()
    where public.ai_usage.count < p_limit
  returning count into taken;
  return taken is not null;
end $$;

-- Gives a slot back after a failed or invalid answer.
create function public.refund_ai(p_user uuid, p_bucket text) returns void
language sql security definer set search_path = '' as $$
  update public.ai_usage set count = greatest(count - 1, 0), updated_at = now() where user_id = p_user and bucket = p_bucket;
$$;

revoke execute on function public.use_ai(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai(uuid, text) from public, anon, authenticated;
grant execute on function public.use_ai(uuid, text, integer) to service_role;
grant execute on function public.refund_ai(uuid, text) to service_role;
revoke all on table public.entitlements, public.ai_usage from anon, authenticated;
