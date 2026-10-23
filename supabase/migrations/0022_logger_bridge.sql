-- =============================================================================
-- Ponte do programa do caller: o programa (no PC do caller) envia loot e dps para o conteúdo.
--
-- - Cada caller cria um TOKEN no perfil do site (aparece uma única vez). O banco guarda só o hash.
-- - O programa chama /api/public/logger com o token; o site repassa para as funções abaixo.
-- - Só entra dado em conteúdos que aquele caller pode editar (dono, administrador ou editor delegado).
-- - Dá para revogar o token a qualquer momento no perfil.
--
-- Pré-requisito: migração 0021 (loot e dps).
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

do $$ begin
  if to_regclass('public.loot_sessions') is null then raise exception 'Rode antes a migração 0021 (loot e dps).'; end if;
end $$;

-- Evita item repetido quando o programa reenvia o mesmo envio.
alter table public.loot_items add column if not exists external_id text check (external_id is null or char_length(external_id) <= 80);
create unique index if not exists loot_items_external_idx on public.loot_items (session_id, external_id) where external_id is not null;

create table if not exists public.logger_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'Meu PC' check (char_length(trim(label)) between 1 and 40),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.logger_tokens enable row level security;
-- O hash nunca sai: só estas colunas são legíveis. Criar passa pela função logger_create_token.
revoke all on public.logger_tokens from anon, authenticated;
grant select (id, label, created_at, last_used_at) on public.logger_tokens to authenticated;
grant delete on public.logger_tokens to authenticated;
grant all on public.logger_tokens to service_role;
drop policy if exists "Own tokens read" on public.logger_tokens;
create policy "Own tokens read" on public.logger_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists "Own tokens delete" on public.logger_tokens;
create policy "Own tokens delete" on public.logger_tokens for delete to authenticated using (user_id = auth.uid());

-- Cria um token novo e devolve o texto UMA vez (o banco guarda só o hash).
create or replace function public.logger_create_token(_label text default 'Meu PC') returns text
language plpgsql security definer set search_path = public as $$
declare token text; lbl text := coalesce(nullif(trim(_label), ''), 'Meu PC');
begin
  if auth.uid() is null then raise exception 'Entre no site para criar um token.' using errcode = 'P0001'; end if;
  if not public.can_access_content_panel() then raise exception 'Só quem cria ou edita conteúdo pode criar um token.' using errcode = 'P0001'; end if;
  if char_length(lbl) > 40 then raise exception 'O nome do token tem no máximo 40 caracteres.' using errcode = 'P0001'; end if;
  if (select count(*) from public.logger_tokens where user_id = auth.uid()) >= 10 then raise exception 'Você já tem 10 tokens. Apague algum.' using errcode = 'P0001'; end if;
  token := 'plx_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.logger_tokens (user_id, label, token_hash) values (auth.uid(), lbl, encode(sha256(convert_to(token, 'utf8')), 'hex'));
  return token;
end $$;
revoke all on function public.logger_create_token(text) from public, anon;
grant execute on function public.logger_create_token(text) to authenticated;

-- Internas (só as funções abaixo as usam).
create or replace function public.logger_user(_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  update public.logger_tokens set last_used_at = now()
    where token_hash = encode(sha256(convert_to(coalesce(_token, ''), 'utf8')), 'hex') returning user_id into uid;
  return uid;
end $$;
revoke all on function public.logger_user(text) from public, anon, authenticated;

create or replace function public.user_can_edit_event(_user uuid, _event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _user is not null and (
    public.has_role(_user, 'admin')
    or (public.has_role(_user, 'creator') and exists (select 1 from public.events where id = _event and created_by = _user))
    or exists (select 1 from public.event_editors where event_id = _event and user_id = _user)
  )
$$;
revoke all on function public.user_can_edit_event(uuid, uuid) from public, anon, authenticated;

-- Conteúdos que o dono do token pode alimentar (para o programa escolher qual).
create or replace function public.logger_my_events(_token text) returns table (id uuid, title text, starts_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.logger_user(_token);
begin
  if uid is null then raise exception 'Token inválido.' using errcode = 'P0001'; end if;
  return query
    select e.id, e.title, e.starts_at from public.events e
    where e.starts_at > now() - interval '12 hours' and public.user_can_edit_event(uid, e.id)
    order by e.starts_at limit 20;
end $$;
revoke all on function public.logger_my_events(text) from public;
grant execute on function public.logger_my_events(text) to anon, authenticated;

-- Recebe loot e dps. Dps e prata são "fotografias" (substituem o valor); itens são acrescentados (com external_id não duplica).
create or replace function public.logger_ingest(_token text, _event uuid, _session uuid default null, _items jsonb default '[]', _dps jsonb default '[]', _silver bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public.logger_user(_token); sid uuid; n_items int := 0; n_dps int := 0;
begin
  if uid is null then raise exception 'Token inválido.' using errcode = 'P0001'; end if;
  if not public.user_can_edit_event(uid, _event) then raise exception 'Você não edita este conteúdo.' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(_items, '[]')) <> 'array' or jsonb_typeof(coalesce(_dps, '[]')) <> 'array' then raise exception 'Formato inválido.' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(_items, '[]')) > 200 or jsonb_array_length(coalesce(_dps, '[]')) > 100 then raise exception 'Muitos dados de uma vez (máximo 200 itens e 100 jogadores).' using errcode = 'P0001'; end if;

  if _session is not null then
    select id into sid from public.loot_sessions where id = _session and event_id = _event;
    if sid is null then raise exception 'Sessão não encontrada neste conteúdo.' using errcode = 'P0001'; end if;
  else
    select id into sid from public.loot_sessions where event_id = _event and status = 'open' order by created_at desc limit 1;
    if sid is null then
      insert into public.loot_sessions (event_id, title, created_by) values (_event, 'Loot (programa)', uid) returning id into sid;
    end if;
  end if;

  with ins as (
    insert into public.loot_items (session_id, name, quantity, unit_value, looted_by, external_id)
    select sid, trim(x.name), coalesce(x.quantity, 1), coalesce(x.unit_value, 0), nullif(trim(x.looted_by), ''), nullif(trim(x.external_id), '')
    from jsonb_to_recordset(coalesce(_items, '[]')) as x(name text, quantity int, unit_value bigint, looted_by text, external_id text)
    where char_length(trim(coalesce(x.name, ''))) between 1 and 80
      and coalesce(x.quantity, 1) between 1 and 100000 and coalesce(x.unit_value, 0) >= 0
      and (x.looted_by is null or char_length(trim(x.looted_by)) between 2 and 32)
      and (x.external_id is null or char_length(trim(x.external_id)) <= 80)
    on conflict (session_id, external_id) where external_id is not null do nothing
    returning 1
  ) select count(*) into n_items from ins;

  with up as (
    insert into public.dps_entries (session_id, nick, damage, healing)
    select sid, trim(x.nick), greatest(0, coalesce(x.damage, 0)), greatest(0, coalesce(x.healing, 0))
    from jsonb_to_recordset(coalesce(_dps, '[]')) as x(nick text, damage bigint, healing bigint)
    where char_length(trim(coalesce(x.nick, ''))) between 2 and 32
    on conflict (session_id, nick) do update set damage = excluded.damage, healing = excluded.healing
    returning 1
  ) select count(*) into n_dps from up;

  if _silver is not null and _silver >= 0 then update public.loot_sessions set silver = _silver where id = sid; end if;
  return jsonb_build_object('session_id', sid, 'items_added', n_items, 'dps_upserted', n_dps);
end $$;
revoke all on function public.logger_ingest(text, uuid, uuid, jsonb, jsonb, bigint) from public;
grant execute on function public.logger_ingest(text, uuid, uuid, jsonb, jsonb, bigint) to anon, authenticated;
