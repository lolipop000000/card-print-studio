create function public.my_usage() returns table(cards int, blob_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select * from public.owner_usage((select auth.uid()))
$$;
revoke execute on function public.my_usage() from public, anon;
grant execute on function public.my_usage() to authenticated;
