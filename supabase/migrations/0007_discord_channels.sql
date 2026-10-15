-- =============================================================================
-- Discord em vários servidores: cada criador conecta o(s) canal(is) do próprio servidor.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

create table public.discord_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  guild_id text not null check (guild_id ~ '^[0-9]{5,25}$'),
  channel_id text not null check (channel_id ~ '^[0-9]{5,25}$'),
  label text check (label is null or char_length(label) <= 100),
  created_at timestamptz not null default now(),
  unique (user_id, channel_id)
);
create index discord_channels_user_idx on public.discord_channels (user_id);
grant select, insert, delete on public.discord_channels to authenticated;
grant all on public.discord_channels to service_role;
alter table public.discord_channels enable row level security;

create policy "Owners and admins read discord channels" on public.discord_channels
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Creators connect own discord channels" on public.discord_channels
  for insert to authenticated with check (user_id = auth.uid() and public.can_create_content());
create policy "Owners and admins remove discord channels" on public.discord_channels
  for delete to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
