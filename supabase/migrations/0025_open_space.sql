-- =============================================================================
-- Espaço público: uma guilda marcada como "aberta" aceita qualquer pessoa logada (sem convite).
-- Só o administrador do site marca uma guilda como aberta. Inclui BANIR (vale para qualquer espaço).
--
-- Rode UMA vez no Supabase (depois da 0024): SQL Editor > New query > cole o CONTEÚDO > Run.
-- Cria o espaço "PingoraX" (slug pingorax) nas mãos do administrador, com #geral e uma sala de voz.
-- =============================================================================

alter table public.guilds add column if not exists is_open boolean not null default false;

-- Só admin (ou o SQL Editor) liga/desliga is_open; ninguém abre a própria guilda por conta.
create or replace function public.guard_guild_open() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then return new; end if;
  if tg_op = 'INSERT' then new.is_open := false;
  elsif new.is_open is distinct from old.is_open then raise exception 'Só o administrador do site abre uma guilda ao público.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guard_guild_open_trg on public.guilds;
create trigger guard_guild_open_trg before insert or update of is_open on public.guilds
  for each row execute function public.guard_guild_open();

-- Banidos ---------------------------------------------------------------------
create table if not exists public.guild_bans (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);
grant select, delete on public.guild_bans to authenticated;
grant all on public.guild_bans to service_role;
alter table public.guild_bans enable row level security;
drop policy if exists "Mods view bans" on public.guild_bans;
create policy "Mods view bans" on public.guild_bans for select to authenticated using (public.is_guild_mod(guild_id));
drop policy if exists "Mods lift bans" on public.guild_bans;
create policy "Mods lift bans" on public.guild_bans for delete to authenticated using (public.is_guild_mod(guild_id));

create or replace function public.ban_guild_member(_guild uuid, _user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target_role text;
begin
  if not public.is_guild_mod(_guild) then raise exception 'Só moderadores banem.' using errcode = 'P0001'; end if;
  if _user = auth.uid() then raise exception 'Você não pode banir a si mesmo.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.guilds where id = _guild and owner_id = _user) then raise exception 'O dono não pode ser banido.' using errcode = 'P0001'; end if;
  select role into target_role from public.guild_members where guild_id = _guild and user_id = _user;
  if target_role = 'mod' and not public.is_guild_owner(_guild) then raise exception 'Só o dono bane um moderador.' using errcode = 'P0001'; end if;
  delete from public.guild_members where guild_id = _guild and user_id = _user;
  insert into public.guild_bans (guild_id, user_id, banned_by) values (_guild, _user, auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.ban_guild_member(uuid, uuid) from public;
grant execute on function public.ban_guild_member(uuid, uuid) to authenticated;

-- Entrar num espaço aberto (um clique). Devolve o slug.
create or replace function public.join_open_space(_guild uuid) returns text
language plpgsql security definer set search_path = public as $$
declare g public.guilds;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para participar.' using errcode = 'P0001'; end if;
  select * into g from public.guilds where id = _guild and is_open;
  if not found then raise exception 'Espaço não encontrado.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.guild_bans where guild_id = g.id and user_id = auth.uid()) then raise exception 'Você foi banido deste espaço.' using errcode = 'P0001'; end if;
  if g.owner_id = auth.uid() then return g.slug; end if;
  if (select count(*) from public.guild_members where guild_id = g.id) >= 2000 then raise exception 'Este espaço está lotado (2000 membros).' using errcode = 'P0001'; end if;
  insert into public.guild_members (guild_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g.slug;
end $$;
revoke all on function public.join_open_space(uuid) from public;
grant execute on function public.join_open_space(uuid) to authenticated;

-- Convite também respeita banimento.
create or replace function public.join_guild(_code text) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.guild_invites; g public.guilds; added integer;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para usar o convite.' using errcode = 'P0001'; end if;
  select * into inv from public.guild_invites where code = trim(coalesce(_code, '')) for update;
  if not found or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'Convite inválido ou vencido. Peça outro a quem te convidou.' using errcode = 'P0001';
  end if;
  select * into g from public.guilds where id = inv.guild_id;
  if exists (select 1 from public.guild_bans where guild_id = g.id and user_id = auth.uid()) then raise exception 'Você foi banido desta guilda.' using errcode = 'P0001'; end if;
  if g.owner_id = auth.uid() then return g.slug; end if;
  if (select count(*) from public.guild_members where guild_id = g.id) >= (case when g.is_open then 2000 else 200 end) then
    raise exception 'Esta guilda atingiu o limite de membros.' using errcode = 'P0001';
  end if;
  insert into public.guild_members (guild_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then update public.guild_invites set uses = uses + 1 where code = inv.code; end if;
  return g.slug;
end $$;

-- O espaço público da comunidade, nas mãos do administrador.
do $$
declare admin_id uuid;
begin
  select user_id into admin_id from public.user_roles where role = 'admin' order by user_id limit 1;
  if admin_id is not null and not exists (select 1 from public.guilds where slug = 'pingorax') then
    insert into public.guilds (slug, name, description, owner_id, is_open)
    values ('pingorax', 'PingoraX', 'Espaço público da comunidade PingoraX: qualquer pessoa logada pode entrar.', admin_id, true);
  end if;
end $$;
