-- =============================================================================
-- 0008: builds em grupo (composições com builds já prontas) + botão "Sair" do Discord
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Builds em grupo: uma composição (ex.: "ZvZ 20 players") que junta builds existentes
-- ---------------------------------------------------------------------------
create table public.build_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  author_name text check (author_name is null or char_length(author_name) between 1 and 40),
  description text check (description is null or char_length(description) <= 500),
  content_type text check (content_type is null or char_length(content_type) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index build_groups_owner_idx on public.build_groups (owner_id);

create table public.build_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.build_groups(id) on delete cascade,
  build_id uuid not null references public.builds(id) on delete cascade,
  role text check (role is null or char_length(role) between 1 and 40),
  quantity smallint not null default 1 check (quantity between 1 and 50),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, build_id)
);
create index build_group_members_group_idx on public.build_group_members (group_id);
create index build_group_members_build_idx on public.build_group_members (build_id);

grant select on public.build_groups, public.build_group_members to anon;
grant select, insert, update, delete on public.build_groups, public.build_group_members to authenticated;
grant all on public.build_groups, public.build_group_members to service_role;
alter table public.build_groups enable row level security;
alter table public.build_group_members enable row level security;

create policy "Anyone reads build groups" on public.build_groups
  for select to anon, authenticated using (true);
create policy "Accounts create own build groups" on public.build_groups
  for insert to authenticated with check (owner_id = auth.uid());
create policy "Owners and admins update build groups" on public.build_groups
  for update to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Owners and admins delete build groups" on public.build_groups
  for delete to authenticated using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Anyone reads build group members" on public.build_group_members
  for select to anon, authenticated using (true);
create policy "Group owners manage members" on public.build_group_members
  for all to authenticated
  using (exists (select 1 from public.build_groups g where g.id = group_id
    and (g.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))))
  with check (exists (select 1 from public.build_groups g where g.id = group_id
    and (g.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))));

-- Limites (evita spam), dono não muda e updated_at automático.
create or replace function public.build_groups_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.build_groups where owner_id = new.owner_id) >= 50 then
      raise exception 'Limite de 50 grupos por conta' using errcode = '23514';
    end if;
  else
    new.owner_id := old.owner_id;
    new.updated_at := now();
  end if;
  return new;
end; $$;
create trigger build_groups_guard_trg before insert or update on public.build_groups
  for each row execute function public.build_groups_guard();

create or replace function public.build_group_members_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.build_group_members where group_id = new.group_id) >= 30 then
    raise exception 'Limite de 30 builds por grupo' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger build_group_members_guard_trg before insert on public.build_group_members
  for each row execute function public.build_group_members_guard();

-- ---------------------------------------------------------------------------
-- Botão "Sair" do Discord: guarda quem pingou pelo Discord (id nunca fica visível
-- para o público) e só deixa remover o ping de quem clicou.
-- ---------------------------------------------------------------------------
create table public.discord_signup_refs (
  signup_id uuid primary key references public.signups(id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{5,25}$')
);
create index discord_signup_refs_user_idx on public.discord_signup_refs (discord_user_id);
alter table public.discord_signup_refs enable row level security;  -- sem policies: só as funções abaixo mexem
grant all on public.discord_signup_refs to service_role;

create or replace function public.discord_signup(p_event uuid, p_weapon uuid, p_nick text, p_discord_user text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_discord_user is null or p_discord_user !~ '^[0-9]{5,25}$' then raise exception 'Usuário do Discord inválido'; end if;
  insert into public.signups (event_id, weapon_id, nick) values (p_event, p_weapon, p_nick) returning id into v_id;
  insert into public.discord_signup_refs (signup_id, discord_user_id) values (v_id, p_discord_user);
end; $$;

create or replace function public.discord_leave(p_event uuid, p_discord_user text)
returns integer language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  if p_discord_user is null or p_discord_user !~ '^[0-9]{5,25}$' then return 0; end if;
  with gone as (
    delete from public.signups s using public.discord_signup_refs r
    where r.signup_id = s.id and s.event_id = p_event and r.discord_user_id = p_discord_user
    returning s.id)
  select count(*) into n from gone;
  return n;
end; $$;

revoke all on function public.discord_signup(uuid, uuid, text, text) from public;
revoke all on function public.discord_leave(uuid, text) from public;
grant execute on function public.discord_signup(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.discord_leave(uuid, text) to anon, authenticated;
