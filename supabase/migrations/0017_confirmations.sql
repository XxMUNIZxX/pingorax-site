-- =============================================================================
-- "Estou a caminho": quem pingou pelo Discord confirma presença no botão do lembrete.
-- O card mostra um ✅ ao lado do nick de quem confirmou.
-- Depende da migração 0008 (pings pelo Discord).
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o lembrete funciona igual, só sem o botão.
-- =============================================================================

create table if not exists public.confirmations (
  event_id uuid not null references public.events(id) on delete cascade,
  nick text not null,
  confirmed_at timestamptz not null default now(),
  primary key (event_id, nick)
);
grant select on public.confirmations to anon, authenticated;
grant all on public.confirmations to service_role;
alter table public.confirmations enable row level security;  -- só leitura pública; quem grava é a função abaixo
create policy "Anyone views confirmations" on public.confirmations for select to anon, authenticated using (true);

-- Confirma os pings que esta pessoa fez pelo Discord neste conteúdo; devolve os nicks confirmados.
create or replace function public.discord_confirm(p_event uuid, p_discord_user text)
returns text[] language plpgsql security definer set search_path = public
as $$
declare v_nicks text[];
begin
  if p_discord_user is null or p_discord_user !~ '^[0-9]{5,25}$' then return '{}'; end if;
  select coalesce(array_agg(s.nick), '{}') into v_nicks
    from public.signups s join public.discord_signup_refs r on r.signup_id = s.id
   where s.event_id = p_event and r.discord_user_id = p_discord_user;
  insert into public.confirmations (event_id, nick)
    select p_event, unnest(v_nicks) on conflict do nothing;
  return v_nicks;
end; $$;
revoke all on function public.discord_confirm(uuid, text) from public;
grant execute on function public.discord_confirm(uuid, text) to anon, authenticated;

-- Quem sai do conteúdo perde a confirmação (e, se voltar a pingar, precisa confirmar de novo).
create or replace function public.drop_confirmation() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.confirmations where event_id = old.event_id and nick = old.nick;
  return old;
end $$;
drop trigger if exists drop_confirmation_trg on public.signups;
create trigger drop_confirmation_trg after delete on public.signups
  for each row execute function public.drop_confirmation();
