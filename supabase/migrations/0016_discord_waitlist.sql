-- =============================================================================
-- Lista de espera pelo Discord: entrar na fila e sair dela pelos botões do card, e aviso no canal
-- quando alguém sobe da fila para a vaga.
-- Depende da migração 0011 (lista de espera) e da 0008 (botão "Sair" do Discord).
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, a fila continua funcionando pelo site, só sem os botões do Discord.
-- =============================================================================

-- Quem entrou na fila pelo Discord (o id nunca fica visível ao público, como em discord_signup_refs).
create table if not exists public.discord_waitlist_refs (
  waitlist_id uuid primary key references public.waitlist(id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{5,25}$')
);
create index if not exists discord_waitlist_refs_user_idx on public.discord_waitlist_refs (discord_user_id);
alter table public.discord_waitlist_refs enable row level security;  -- sem policies: só as funções abaixo mexem
grant all on public.discord_waitlist_refs to service_role;

-- Promoções da fila ainda não avisadas no Discord.
create table if not exists public.waitlist_promotions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  weapon_id uuid references public.event_weapons(id) on delete set null,
  nick text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create index if not exists waitlist_promotions_pending_idx on public.waitlist_promotions (created_at) where notified_at is null;
alter table public.waitlist_promotions enable row level security;  -- sem policies: só as funções abaixo mexem
grant all on public.waitlist_promotions to service_role;

-- Entrar na fila pelo Discord: devolve a posição (as regras de quem pode entrar são as do gatilho da 0011).
create or replace function public.discord_waitlist_join(p_event uuid, p_weapon uuid, p_nick text, p_discord_user text)
returns integer language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_pos integer;
begin
  if p_discord_user is null or p_discord_user !~ '^[0-9]{5,25}$' then raise exception 'Usuário do Discord inválido'; end if;
  insert into public.waitlist (event_id, weapon_id, nick) values (p_event, p_weapon, p_nick) returning id into v_id;
  insert into public.discord_waitlist_refs (waitlist_id, discord_user_id) values (v_id, p_discord_user);
  select count(*) into v_pos from public.waitlist where event_id = p_event
    and (created_at, id) <= (select (created_at, id) from public.waitlist where id = v_id);
  return v_pos;
end; $$;

-- "Sair" agora tira o ping E a posição na fila de quem clicou; devolve quantas coisas foram removidas.
create or replace function public.discord_leave(p_event uuid, p_discord_user text)
returns integer language plpgsql security definer set search_path = public
as $$
declare n integer; q integer;
begin
  if p_discord_user is null or p_discord_user !~ '^[0-9]{5,25}$' then return 0; end if;
  -- Primeiro a fila: senão o ping removido promoveria quem está saindo.
  with gone as (
    delete from public.waitlist w using public.discord_waitlist_refs r
    where r.waitlist_id = w.id and w.event_id = p_event and r.discord_user_id = p_discord_user
    returning w.id)
  select count(*) into q from gone;
  with gone as (
    delete from public.signups s using public.discord_signup_refs r
    where r.signup_id = s.id and s.event_id = p_event and r.discord_user_id = p_discord_user
    returning s.id)
  select count(*) into n from gone;
  return n + q;
end; $$;

-- Subida da fila: agora também registra a promoção (para avisar no canal) e mantém o vínculo com o Discord,
-- para quem subiu poder usar o "Sair" do card.
create or replace function public.promote_waitlist() returns trigger
language plpgsql security definer set search_path = public
as $$
declare ev public.events; cand public.waitlist; v_discord text; v_signup uuid;
begin
  select * into ev from public.events where id = old.event_id;
  if ev.id is null then return old; end if;  -- conteúdo apagado
  perform pg_advisory_xact_lock(hashtext(old.event_id::text));
  if (select count(*) from public.signups where event_id = old.event_id) >= ev.max_players then return old; end if;
  select q.* into cand from public.waitlist q
   where q.event_id = old.event_id
     and (select count(*) from public.signups s where s.weapon_id = q.weapon_id)
         < (select slots from public.event_weapons where id = q.weapon_id)
   order by (q.weapon_id = old.weapon_id) desc, q.created_at
   limit 1;
  if cand.id is null then return old; end if;
  begin
    select discord_user_id into v_discord from public.discord_waitlist_refs where waitlist_id = cand.id;
    delete from public.waitlist where id = cand.id;
    insert into public.signups (event_id, weapon_id, nick) values (cand.event_id, cand.weapon_id, cand.nick) returning id into v_signup;
    if v_discord is not null then
      insert into public.discord_signup_refs (signup_id, discord_user_id) values (v_signup, v_discord);
    end if;
    insert into public.waitlist_promotions (event_id, weapon_id, nick) values (cand.event_id, cand.weapon_id, cand.nick);
  exception when others then
    null;  -- nunca impede a remoção original
  end;
  return old;
end $$;

-- O bot pega as promoções ainda não avisadas (de um conteúdo ou de todos) e já as marca como avisadas.
create or replace function public.discord_claim_promotions(p_event uuid default null)
returns table (event_id uuid, weapon_id uuid, nick text)
language sql security definer set search_path = public
as $$
  with claimed as (
    update public.waitlist_promotions p set notified_at = now()
     where p.id in (
       select id from public.waitlist_promotions
        where notified_at is null and created_at > now() - interval '6 hours'
          and (p_event is null or waitlist_promotions.event_id = p_event)
        order by created_at limit 20)
    returning p.event_id, p.weapon_id, p.nick, p.created_at)
  select c.event_id, c.weapon_id, c.nick from claimed c order by c.created_at;
$$;

revoke all on function public.discord_waitlist_join(uuid, uuid, text, text) from public;
revoke all on function public.discord_claim_promotions(uuid) from public;
grant execute on function public.discord_waitlist_join(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.discord_claim_promotions(uuid) to anon, authenticated;
