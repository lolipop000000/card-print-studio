alter table public.tier_limits   enable row level security;
alter table public.profiles      enable row level security;
alter table public.blobs         enable row level security;
alter table public.works         enable row level security;
alter table public.work_drafts   enable row level security;
alter table public.work_versions enable row level security;
alter table public.shared_assets enable row level security;
alter table public.audit_log     enable row level security;
alter table public.import_runs   enable row level security;
alter table public.public_feed   enable row level security;

-- 쓰기 권한 자체를 회수 (RLS에 더한 이중 방어). 쓰기는 service role만.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.audit_log, public.blobs, public.import_runs from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;

create policy works_read on public.works for select to anon, authenticated
  using ((visibility = 'public' and deleted_at is null) or owner = (select auth.uid()));
create policy assets_read on public.shared_assets for select to anon, authenticated
  using ((visibility = 'public' and deleted_at is null) or owner = (select auth.uid()));
create policy drafts_read on public.work_drafts for select to authenticated
  using (owner = (select auth.uid()));
create policy versions_read on public.work_versions for select to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.owner = (select auth.uid())));
create policy feed_read on public.public_feed for select to anon, authenticated using (true);
create policy tiers_read on public.tier_limits for select to anon, authenticated using (true);
create policy profiles_self on public.profiles for select to authenticated using (id = (select auth.uid()));

-- 닉네임만 공개하는 뷰 (뷰 소유자 권한으로 읽으므로 id, nickname 두 열만 노출)
create view public.public_profiles as select id, nickname from public.profiles;
grant select on public.public_profiles to anon, authenticated;

revoke execute on function public.owner_usage(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Realtime: 가벼운 피드만
alter publication supabase_realtime add table public.public_feed;
