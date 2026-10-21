-- =============================================================================
-- Perfil de usuário: nome, nick no Albion, guilda e se é líder dela.
-- O login por Discord/Google é configurado no painel do Supabase (veja o PR), não aqui.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando, só sem perfil.
--
-- Importante: "líder" aqui é uma declaração da própria pessoa e NÃO dá permissão nenhuma.
-- Quem de fato manda numa página de guilda é o dono dela (guilds.owner_id).
-- =============================================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 40),
  albion_nick text check (albion_nick is null or char_length(trim(albion_nick)) between 2 and 32),
  avatar_url text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)),
  guild_id uuid references public.guilds(id) on delete set null,
  albion_guild text check (albion_guild is null or char_length(trim(albion_guild)) between 2 and 40),
  guild_leader boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_guild_idx on public.profiles (guild_id);
grant select on public.profiles to anon, authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- Públicos: nome, nick, avatar e guilda (o e-mail nunca fica aqui).
create policy "Anyone views profiles" on public.profiles for select to anon, authenticated using (true);
create policy "Users create own profile" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "Users edit own profile" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete own profile" on public.profiles for delete to authenticated using (user_id = auth.uid());

create or replace function public.touch_profile() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_profile_trg on public.profiles;
create trigger touch_profile_trg before update on public.profiles for each row execute function public.touch_profile();
