-- =============================================================================
-- Histórico de presença: quem criou/edita o conteúdo marca quem compareceu.
-- Só quem gerencia o conteúdo enxerga e altera estes dados (não são públicos).
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando, só sem presença.
-- =============================================================================

create table if not exists public.attendance (
  event_id uuid not null references public.events(id) on delete cascade,
  nick text not null check (char_length(trim(nick)) between 2 and 32),
  present boolean not null,
  marked_at timestamptz not null default now(),
  primary key (event_id, nick)
);
grant select, insert, update, delete on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;

create policy "Editors read attendance" on public.attendance
  for select to authenticated using (public.can_edit_event(event_id) or public.can_manage_event(event_id));
create policy "Editors write attendance" on public.attendance
  for insert to authenticated with check (public.can_edit_event(event_id) or public.can_manage_event(event_id));
create policy "Editors change attendance" on public.attendance
  for update to authenticated using (public.can_edit_event(event_id) or public.can_manage_event(event_id))
  with check (public.can_edit_event(event_id) or public.can_manage_event(event_id));
create policy "Editors delete attendance" on public.attendance
  for delete to authenticated using (public.can_edit_event(event_id) or public.can_manage_event(event_id));
