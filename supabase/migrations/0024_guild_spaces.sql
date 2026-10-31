-- =============================================================================
-- Espaço da guilda: canais permanentes de texto e de voz, só para membros.
--
-- Membro de verdade = dono da guilda, ou quem entrou por um CONVITE gerado pelo dono/moderador
-- (a guilda escolhida no perfil é só uma declaração e NÃO dá acesso ao espaço).
-- Cargos: dono (guilds.owner_id) > moderador ('mod') > membro ('member'). Admin do site modera tudo.
-- Moderador: cria/apaga canais, apaga mensagens de qualquer um, convida e remove membros.
-- Só o dono (ou admin) promove e rebaixa moderadores.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto também está em supabase/schema.sql. Sem rodar, o site continua igual, só sem o espaço.
-- =============================================================================

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('mod', 'member')),
  created_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);
create index if not exists guild_members_user_idx on public.guild_members (user_id);

create or replace function public.is_guild_member(_guild uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.guilds g where g.id = _guild and g.owner_id = auth.uid())
    or exists (select 1 from public.guild_members m where m.guild_id = _guild and m.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin'));
$$;
create or replace function public.is_guild_mod(_guild uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.guilds g where g.id = _guild and g.owner_id = auth.uid())
    or exists (select 1 from public.guild_members m where m.guild_id = _guild and m.user_id = auth.uid() and m.role = 'mod')
    or public.has_role(auth.uid(), 'admin'));
$$;
create or replace function public.is_guild_owner(_guild uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.guilds g where g.id = _guild and g.owner_id = auth.uid())
    or public.has_role(auth.uid(), 'admin'));
$$;
revoke all on function public.is_guild_member(uuid), public.is_guild_mod(uuid), public.is_guild_owner(uuid) from public;
grant execute on function public.is_guild_member(uuid), public.is_guild_mod(uuid), public.is_guild_owner(uuid) to authenticated;

grant select, delete on public.guild_members to authenticated;
grant update (role) on public.guild_members to authenticated;
grant all on public.guild_members to service_role;
alter table public.guild_members enable row level security;
drop policy if exists "Members view members" on public.guild_members;
create policy "Members view members" on public.guild_members for select to authenticated using (public.is_guild_member(guild_id));
drop policy if exists "Leave or be removed" on public.guild_members;
create policy "Leave or be removed" on public.guild_members for delete to authenticated
  using (user_id = auth.uid() or public.is_guild_mod(guild_id));
drop policy if exists "Owner sets roles" on public.guild_members;
create policy "Owner sets roles" on public.guild_members for update to authenticated
  using (public.is_guild_owner(guild_id)) with check (public.is_guild_owner(guild_id) and role in ('mod', 'member'));

-- Convites ------------------------------------------------------------------
create table if not exists public.guild_invites (
  code text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  max_uses integer not null default 25 check (max_uses between 1 and 200),
  uses integer not null default 0,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create index if not exists guild_invites_guild_idx on public.guild_invites (guild_id);
grant select, insert, delete on public.guild_invites to authenticated;
grant all on public.guild_invites to service_role;
alter table public.guild_invites enable row level security;
drop policy if exists "Mods view invites" on public.guild_invites;
create policy "Mods view invites" on public.guild_invites for select to authenticated using (public.is_guild_mod(guild_id));
drop policy if exists "Mods create invites" on public.guild_invites;
create policy "Mods create invites" on public.guild_invites for insert to authenticated
  with check (public.is_guild_mod(guild_id) and created_by = auth.uid()
              and (select count(*) from public.guild_invites i where i.guild_id = guild_invites.guild_id and i.expires_at > now()) < 10);
drop policy if exists "Mods delete invites" on public.guild_invites;
create policy "Mods delete invites" on public.guild_invites for delete to authenticated using (public.is_guild_mod(guild_id));

-- Entrar com um convite: devolve o slug da guilda.
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
  if g.owner_id = auth.uid() then return g.slug; end if;
  if (select count(*) from public.guild_members where guild_id = g.id) >= 200 then
    raise exception 'Esta guilda atingiu o limite de 200 membros.' using errcode = 'P0001';
  end if;
  insert into public.guild_members (guild_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then update public.guild_invites set uses = uses + 1 where code = inv.code; end if;
  return g.slug;
end $$;
revoke all on function public.join_guild(text) from public;
grant execute on function public.join_guild(text) to authenticated;

-- Canais --------------------------------------------------------------------
create table if not exists public.guild_channels (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  kind text not null check (kind in ('text', 'voice')),
  name text not null check (char_length(trim(name)) between 2 and 30),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists guild_channels_name_idx on public.guild_channels (guild_id, kind, lower(name));
grant select, insert, update, delete on public.guild_channels to authenticated;
grant all on public.guild_channels to service_role;
alter table public.guild_channels enable row level security;
drop policy if exists "Members view channels" on public.guild_channels;
create policy "Members view channels" on public.guild_channels for select to authenticated using (public.is_guild_member(guild_id));
drop policy if exists "Mods create channels" on public.guild_channels;
create policy "Mods create channels" on public.guild_channels for insert to authenticated
  with check (public.is_guild_mod(guild_id) and (select count(*) from public.guild_channels c where c.guild_id = guild_channels.guild_id) < 20);
drop policy if exists "Mods rename channels" on public.guild_channels;
create policy "Mods rename channels" on public.guild_channels for update to authenticated
  using (public.is_guild_mod(guild_id)) with check (public.is_guild_mod(guild_id));
drop policy if exists "Mods delete channels" on public.guild_channels;
create policy "Mods delete channels" on public.guild_channels for delete to authenticated using (public.is_guild_mod(guild_id));

-- Toda guilda nasce com #geral e uma sala de voz; as que já existem recebem agora.
create or replace function public.seed_guild_channels() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.guild_channels (guild_id, kind, name, position) values
    (new.id, 'text', 'geral', 0), (new.id, 'voice', 'Sala de voz', 0) on conflict do nothing;
  return new;
end $$;
drop trigger if exists seed_guild_channels_trg on public.guilds;
create trigger seed_guild_channels_trg after insert on public.guilds for each row execute function public.seed_guild_channels();
insert into public.guild_channels (guild_id, kind, name, position)
  select id, 'text', 'geral', 0 from public.guilds on conflict do nothing;
insert into public.guild_channels (guild_id, kind, name, position)
  select id, 'voice', 'Sala de voz', 0 from public.guilds on conflict do nothing;

-- Mensagens -----------------------------------------------------------------
create table if not exists public.guild_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.guild_channels(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nick text not null check (char_length(nick) between 2 and 40),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists guild_messages_channel_idx on public.guild_messages (channel_id, created_at desc);
grant select, delete on public.guild_messages to authenticated;
grant all on public.guild_messages to service_role;
alter table public.guild_messages enable row level security;
drop policy if exists "Members read messages" on public.guild_messages;
create policy "Members read messages" on public.guild_messages for select to authenticated using (public.is_guild_member(guild_id));
drop policy if exists "Author or mod deletes" on public.guild_messages;
create policy "Author or mod deletes" on public.guild_messages for delete to authenticated
  using ((user_id = auth.uid() and public.is_guild_member(guild_id)) or public.is_guild_mod(guild_id));

create or replace function public.send_guild_message(_channel uuid, _body text) returns public.guild_messages
language plpgsql security definer set search_path = public as $$
declare ch public.guild_channels; b text := trim(coalesce(_body, '')); n text; row public.guild_messages;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = 'P0001'; end if;
  select * into ch from public.guild_channels where id = _channel;
  if not found or ch.kind <> 'text' then raise exception 'Canal não encontrado.' using errcode = 'P0001'; end if;
  if not public.is_guild_member(ch.guild_id) then raise exception 'Só membros da guilda escrevem aqui.' using errcode = 'P0001'; end if;
  if char_length(b) < 1 or char_length(b) > 1000 then raise exception 'A mensagem deve ter de 1 a 1000 caracteres.' using errcode = 'P0001'; end if;
  if (select count(*) from public.guild_messages where user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Calma! Muitas mensagens seguidas.' using errcode = 'P0001';
  end if;
  select coalesce(nullif(trim(albion_nick), ''), nullif(trim(display_name), ''), 'Membro') into n from public.profiles where user_id = auth.uid();
  insert into public.guild_messages (channel_id, guild_id, user_id, nick, body)
    values (ch.id, ch.guild_id, auth.uid(), coalesce(n, 'Membro'), b) returning * into row;
  return row;
end $$;
revoke all on function public.send_guild_message(uuid, text) from public;
grant execute on function public.send_guild_message(uuid, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.guild_messages;
exception when duplicate_object or undefined_object then null;
end $$;
