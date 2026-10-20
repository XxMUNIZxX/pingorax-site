-- =============================================================================
-- Lista de espera: quando o conteúdo (ou a arma) está lotado, a pessoa entra na fila
-- e sobe sozinha para a vaga quando alguém sai.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando, só sem a lista de espera.
-- =============================================================================

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  weapon_id uuid not null references public.event_weapons(id) on delete cascade,
  nick text not null check (char_length(trim(nick)) between 2 and 32),
  created_at timestamptz not null default now(),
  unique (event_id, nick)
);
create index if not exists waitlist_event_idx on public.waitlist (event_id, created_at);
grant select, insert on public.waitlist to anon, authenticated;
grant delete on public.waitlist to authenticated;
grant all on public.waitlist to service_role;
alter table public.waitlist enable row level security;

create policy "Anyone views waitlist" on public.waitlist for select to anon, authenticated using (true);
create policy "Anyone joins waitlist" on public.waitlist for insert to anon, authenticated with check (true);
create policy "Owners and admins remove waitlist" on public.waitlist for delete to authenticated using (public.can_manage_event(event_id));
create policy "Delegated editors remove waitlist" on public.waitlist for delete to authenticated using (public.can_edit_event(event_id));

-- Só entra na fila quem realmente não tem vaga; nick que já pingou não entra; no máximo 50 por conteúdo.
create or replace function public.validate_waitlist() returns trigger
language plpgsql security definer set search_path = public
as $$
declare ev public.events; w public.event_weapons; v_event_full boolean; v_weapon_full boolean;
begin
  perform pg_advisory_xact_lock(hashtext(new.event_id::text));
  select * into ev from public.events where id = new.event_id;
  select * into w from public.event_weapons where id = new.weapon_id;
  if ev.id is null or w.id is null then raise exception 'Conteúdo ou arma não encontrados'; end if;
  if w.event_id is distinct from new.event_id then raise exception 'Arma inválida para este conteúdo'; end if;
  new.nick := trim(new.nick);
  if exists (select 1 from public.signups where event_id = new.event_id and nick = new.nick) then
    raise exception 'Esse nick já pingou neste conteúdo'; end if;
  v_event_full := (select count(*) from public.signups where event_id = new.event_id) >= ev.max_players;
  v_weapon_full := (select count(*) from public.signups where weapon_id = new.weapon_id) >= w.slots;
  if not (v_event_full or v_weapon_full) then raise exception 'Ainda há vaga nessa arma: pingue direto'; end if;
  if (select count(*) from public.waitlist where event_id = new.event_id) >= 50 then
    raise exception 'A lista de espera está cheia'; end if;
  return new;
end $$;
drop trigger if exists validate_waitlist_trg on public.waitlist;
create trigger validate_waitlist_trg before insert on public.waitlist
  for each row execute function public.validate_waitlist();

-- Quando um ping sai, o primeiro da fila (da mesma arma; senão o mais antigo com vaga) sobe para o lugar.
create or replace function public.promote_waitlist() returns trigger
language plpgsql security definer set search_path = public
as $$
declare ev public.events; cand public.waitlist;
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
    delete from public.waitlist where id = cand.id;
    insert into public.signups (event_id, weapon_id, nick) values (cand.event_id, cand.weapon_id, cand.nick);
  exception when others then
    null;  -- nunca impede a remoção original
  end;
  return old;
end $$;
drop trigger if exists promote_waitlist_trg on public.signups;
create trigger promote_waitlist_trg after delete on public.signups
  for each row execute function public.promote_waitlist();

do $$ begin
  alter publication supabase_realtime add table public.waitlist;
exception when duplicate_object or undefined_object then null;
end $$;
