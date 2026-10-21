create extension if not exists pgcrypto;

create table public.tier_limits(
  tier text primary key check (tier in ('trial','member')),
  max_cards int not null check (max_cards >= 0),
  max_blob_bytes bigint not null check (max_blob_bytes >= 0));
insert into public.tier_limits values ('trial',10,15728640),('member',120,157286400);

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 2 and 20),
  status text not null default 'pending' check (status in ('pending','trial','member','revoked')),
  created_at timestamptz not null default now());
create unique index profiles_nickname_ci on public.profiles (lower(nickname)) where nickname is not null;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.blobs(
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  bytes bigint not null check (bytes > 0 and bytes <= 20971520),
  uploader uuid not null references public.profiles(id),
  created_at timestamptz not null default now());

create table public.works(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  visibility text not null default 'private' check (visibility in ('private','public')),
  data jsonb not null,
  card_count int not null check (card_count >= 0),
  blob_refs text[] not null default '{}',
  version int not null default 1 check (version >= 1),
  source_work_id uuid,
  source_owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz);
create index works_owner on public.works(owner);
create index works_public on public.works(updated_at desc) where visibility = 'public' and deleted_at is null;

create table public.work_drafts(
  work_id uuid primary key references public.works(id) on delete cascade,
  owner uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  card_count int not null check (card_count >= 0),
  blob_refs text[] not null default '{}',
  saved_at timestamptz not null default now());

create table public.work_versions(
  id bigserial primary key,
  work_id uuid not null references public.works(id) on delete cascade,
  version int not null,
  data jsonb not null,
  blob_refs text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (work_id, version));

create table public.shared_assets(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('effect_template','image','card_template','keyword')),
  title text not null check (char_length(title) between 1 and 120),
  visibility text not null default 'private' check (visibility in ('private','public')),
  data jsonb not null,
  blob_refs text[] not null default '{}',
  version int not null default 1 check (version >= 1),
  source_asset_id uuid,
  source_owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz);
create index assets_owner on public.shared_assets(owner);

create table public.audit_log(
  id bigserial primary key,
  actor uuid,
  action text not null,
  target uuid,
  ok boolean not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now());
create index audit_actor_time on public.audit_log(actor, action, created_at desc);

create table public.import_runs(
  id bigserial primary key,
  owner uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  decks int not null default 0,
  blobs int not null default 0,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null);

create table public.public_feed(
  item_id uuid primary key,
  kind text not null check (kind in ('work','asset')),
  asset_kind text,
  owner uuid not null,
  nickname text,
  title text not null,
  version int not null,
  updated_at timestamptz not null);

-- 테이블마다 별도 함수 (plpgsql은 없는 컬럼 참조를 실행 시점에 오류로 냄)
create function public.feed_from_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then delete from public.public_feed where item_id = old.id; return old; end if;
  if new.visibility = 'public' and new.deleted_at is null then
    insert into public.public_feed(item_id,kind,asset_kind,owner,nickname,title,version,updated_at)
    values (new.id,'work',null,new.owner,(select nickname from public.profiles where id = new.owner),new.title,new.version,new.updated_at)
    on conflict (item_id) do update set title = excluded.title, nickname = excluded.nickname,
      version = excluded.version, updated_at = excluded.updated_at;
  else
    delete from public.public_feed where item_id = new.id;
  end if;
  return new;
end $$;
create trigger works_feed after insert or update or delete on public.works
  for each row execute function public.feed_from_work();

create function public.feed_from_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then delete from public.public_feed where item_id = old.id; return old; end if;
  if new.visibility = 'public' and new.deleted_at is null then
    insert into public.public_feed(item_id,kind,asset_kind,owner,nickname,title,version,updated_at)
    values (new.id,'asset',new.kind,new.owner,(select nickname from public.profiles where id = new.owner),new.title,new.version,new.updated_at)
    on conflict (item_id) do update set title = excluded.title, nickname = excluded.nickname,
      version = excluded.version, updated_at = excluded.updated_at;
  else
    delete from public.public_feed where item_id = new.id;
  end if;
  return new;
end $$;
create trigger assets_feed after insert or update or delete on public.shared_assets
  for each row execute function public.feed_from_asset();

create function public.feed_nickname() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.public_feed set nickname = new.nickname where owner = new.id;
  return new;
end $$;
create trigger profiles_feed_nickname after update of nickname on public.profiles
  for each row execute function public.feed_nickname();

create function public.owner_usage(uid uuid) returns table(cards int, blob_bytes bigint)
language sql stable security definer set search_path = '' as $$
  with w as (
    select greatest(w.card_count, coalesce(d.card_count, 0)) as c,
           w.blob_refs || coalesce(d.blob_refs, '{}') as refs
    from public.works w left join public.work_drafts d on d.work_id = w.id
    where w.owner = uid and w.deleted_at is null),
  a as (select blob_refs as refs from public.shared_assets where owner = uid and deleted_at is null),
  h as (select distinct unnest(refs) as sha from (select refs from w union all select refs from a) x)
  select coalesce((select sum(c) from w), 0)::int,
         coalesce((select sum(b.bytes) from h join public.blobs b on b.sha256 = h.sha), 0)::bigint
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('blobs', 'blobs', true, 20971520, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
