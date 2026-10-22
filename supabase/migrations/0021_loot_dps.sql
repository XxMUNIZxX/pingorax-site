-- =============================================================================
-- Loot e dps de cada conteúdo: sessão de loot, itens, prata, dps e divisão definida pelo caller.
--
-- Quem LÊ: quem gerencia/edita o conteúdo e quem pingou (inscrito ou na fila) com o nick do próprio perfil.
-- Quem ESCREVE: só quem gerencia ou edita o conteúdo (o caller e os editores delegados).
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando, só sem o painel de loot.
-- Pré-requisitos: 0014 (perfil) e 0011 (fila).
-- =============================================================================

create or replace function public.is_event_member(_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.can_edit_event(_event_id)
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.albion_nick is not null and (
        exists (select 1 from public.signups s where s.event_id = _event_id and lower(trim(s.nick)) = lower(trim(p.albion_nick)))
        or exists (select 1 from public.waitlist w where w.event_id = _event_id and lower(trim(w.nick)) = lower(trim(p.albion_nick)))
      )
    )
  )
$$;
grant execute on function public.is_event_member(uuid) to authenticated;

create table if not exists public.loot_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null default 'Loot' check (char_length(trim(title)) between 1 and 80),
  silver bigint not null default 0 check (silver >= 0),
  split_config jsonb not null default '{}'::jsonb,
  people jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists loot_sessions_event_idx on public.loot_sessions (event_id, created_at);

create table if not exists public.loot_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.loot_sessions(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  quantity integer not null default 1 check (quantity between 1 and 100000),
  unit_value bigint not null default 0 check (unit_value >= 0),
  looted_by text check (looted_by is null or char_length(looted_by) between 2 and 32),
  created_at timestamptz not null default now()
);
create index if not exists loot_items_session_idx on public.loot_items (session_id, created_at);

create table if not exists public.dps_entries (
  session_id uuid not null references public.loot_sessions(id) on delete cascade,
  nick text not null check (char_length(nick) between 2 and 32),
  damage bigint not null default 0 check (damage >= 0),
  healing bigint not null default 0 check (healing >= 0),
  primary key (session_id, nick)
);

grant select, insert, update, delete on public.loot_sessions, public.loot_items, public.dps_entries to authenticated;
grant all on public.loot_sessions, public.loot_items, public.dps_entries to service_role;
alter table public.loot_sessions enable row level security;
alter table public.loot_items enable row level security;
alter table public.dps_entries enable row level security;

drop policy if exists "Members read loot sessions" on public.loot_sessions;
create policy "Members read loot sessions" on public.loot_sessions for select to authenticated using (public.is_event_member(event_id));
drop policy if exists "Editors write loot sessions" on public.loot_sessions;
create policy "Editors write loot sessions" on public.loot_sessions for all to authenticated
  using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));

drop policy if exists "Members read loot items" on public.loot_items;
create policy "Members read loot items" on public.loot_items for select to authenticated
  using (exists (select 1 from public.loot_sessions s where s.id = session_id and public.is_event_member(s.event_id)));
drop policy if exists "Editors write loot items" on public.loot_items;
create policy "Editors write loot items" on public.loot_items for all to authenticated
  using (exists (select 1 from public.loot_sessions s where s.id = session_id and public.can_edit_event(s.event_id)))
  with check (exists (select 1 from public.loot_sessions s where s.id = session_id and public.can_edit_event(s.event_id)));

drop policy if exists "Members read dps" on public.dps_entries;
create policy "Members read dps" on public.dps_entries for select to authenticated
  using (exists (select 1 from public.loot_sessions s where s.id = session_id and public.is_event_member(s.event_id)));
drop policy if exists "Editors write dps" on public.dps_entries;
create policy "Editors write dps" on public.dps_entries for all to authenticated
  using (exists (select 1 from public.loot_sessions s where s.id = session_id and public.can_edit_event(s.event_id)))
  with check (exists (select 1 from public.loot_sessions s where s.id = session_id and public.can_edit_event(s.event_id)));

do $$ begin
  alter publication supabase_realtime add table public.loot_sessions;
exception when duplicate_object or undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.loot_items;
exception when duplicate_object or undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.dps_entries;
exception when duplicate_object or undefined_object then null;
end $$;
