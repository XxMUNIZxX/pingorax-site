-- =============================================================================
-- Lembrete automático no Discord: o bot avisa no canal quando o conteúdo está perto de começar.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o bot continua funcionando, só sem os lembretes.
-- =============================================================================

alter table public.discord_posts add column if not exists reminded_at timestamptz;

-- "Reserva" o lembrete de um conteúdo: devolve true para quem chegou primeiro (evita lembrete em dobro)
-- e só vale quando o conteúdo começa nos próximos 35 minutos.
create or replace function public.discord_claim_reminder(p_event uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_rows int;
begin
  update public.discord_posts p set reminded_at = now()
    from public.events e
   where p.event_id = p_event and e.id = p.event_id and p.reminded_at is null
     and e.starts_at > now() and e.starts_at <= now() + interval '35 minutes';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function public.discord_claim_reminder(uuid) from public;
grant execute on function public.discord_claim_reminder(uuid) to anon, authenticated;

-- Se o horário do conteúdo mudar, o lembrete vale de novo.
create or replace function public.reset_discord_reminder() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.starts_at is distinct from old.starts_at then
    update public.discord_posts set reminded_at = null where event_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists reset_discord_reminder on public.events;
create trigger reset_discord_reminder after update of starts_at on public.events
  for each row execute function public.reset_discord_reminder();
