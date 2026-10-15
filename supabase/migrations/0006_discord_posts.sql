-- =============================================================================
-- Discord: guarda em qual mensagem do canal cada conteúdo foi postado,
-- para o bot atualizar as vagas em tempo real.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

create table public.discord_posts (
  event_id uuid primary key references public.events(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{5,25}$'),
  message_id text not null check (message_id ~ '^[0-9]{5,25}$'),
  created_at timestamptz not null default now()
);
grant select on public.discord_posts to anon, authenticated;
grant insert, update, delete on public.discord_posts to authenticated;
grant all on public.discord_posts to service_role;
alter table public.discord_posts enable row level security;

create policy "Anyone reads discord posts" on public.discord_posts
  for select to anon, authenticated using (true);
create policy "Editors manage discord posts" on public.discord_posts
  for all to authenticated
  using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));
