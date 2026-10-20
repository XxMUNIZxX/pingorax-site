-- =============================================================================
-- Página de guilda: /g/<endereço> mostra os próximos conteúdos da guilda.
-- Quem pode criar conteúdo cria a guilda (até 3 por conta) e escolhe a guilda de cada conteúdo.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando, só sem guildas.
-- =============================================================================

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  name text not null check (char_length(trim(name)) between 2 and 60),
  description text check (description is null or char_length(description) <= 500),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.guilds to anon, authenticated;
grant insert, update, delete on public.guilds to authenticated;
grant all on public.guilds to service_role;
alter table public.guilds enable row level security;

create policy "Anyone views guilds" on public.guilds for select to anon, authenticated using (true);
create policy "Creators create guilds" on public.guilds for insert to authenticated
  with check (public.can_create_content() and owner_id = auth.uid()
              and (select count(*) from public.guilds g where g.owner_id = auth.uid()) < 3);
create policy "Owners and admins edit guilds" on public.guilds for update to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Owners and admins delete guilds" on public.guilds for delete to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

alter table public.events add column if not exists guild_id uuid references public.guilds(id) on delete set null;
create index if not exists events_guild_idx on public.events (guild_id, starts_at);

-- Um conteúdo só pode ser ligado a uma guilda do próprio criador (ou de quem está salvando, ou por admin):
-- impede alguém de pendurar conteúdo na página de outra guilda.
create or replace function public.validate_event_guild() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.guild_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.guild_id is not distinct from old.guild_id then return new; end if;
  if not exists (
    select 1 from public.guilds g
     where g.id = new.guild_id
       and (g.owner_id = auth.uid() or g.owner_id = new.created_by or public.has_role(auth.uid(), 'admin'))
  ) then
    raise exception 'Você não pode usar essa guilda neste conteúdo';
  end if;
  return new;
end $$;
drop trigger if exists validate_event_guild_trg on public.events;
create trigger validate_event_guild_trg before insert or update of guild_id on public.events
  for each row execute function public.validate_event_guild();
