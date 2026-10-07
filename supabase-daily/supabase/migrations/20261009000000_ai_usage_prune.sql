-- use_ai also prunes: whenever it takes a slot, that user's ai_usage rows untouched for 40 days are deleted, so the
-- table stays small (every bucket is keyed by a day or a week and is never read again after that). Same signature,
-- security definer and search_path as 20261008000000_daily_plus.sql.
create or replace function public.use_ai(p_user uuid, p_bucket text, p_limit integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare taken integer;
begin
  insert into public.ai_usage (user_id, bucket, count) values (p_user, p_bucket, 1)
  on conflict (user_id, bucket) do update set count = public.ai_usage.count + 1, updated_at = now()
    where public.ai_usage.count < p_limit
  returning count into taken;
  if taken is not null then
    delete from public.ai_usage where user_id = p_user and updated_at < now() - interval '40 days';
  end if;
  return taken is not null;
end $$;

revoke execute on function public.use_ai(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.use_ai(uuid, text, integer) to service_role;
