-- =============================================================================
-- Chat em tempo real dentro de cada conteúdo.
--
-- Quem pode LER: qualquer pessoa que abra a página do conteúdo (mesma regra do conteúdo: se o
-- link for privado, só quem tem o link chega lá).
-- Quem pode ESCREVER: só quem já pingou (inscrito ou na fila de espera) ou o caller do conteúdo,
-- usando o nick com que pingou. Escrever passa pela função send_event_message, que também limita
-- o ritmo (5 mensagens a cada 10 s por nick). Apagar mensagens: quem gerencia o conteúdo.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando, só sem o chat.
--
-- Atenção: o nick não tem senha (igual ao ping), então alguém pode digitar o nick de outra
-- pessoa inscrita. O chat serve para combinar o conteúdo, não como prova de identidade.
-- =============================================================================

create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  nick text not null check (char_length(nick) between 2 and 32),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists event_messages_event_idx on public.event_messages (event_id, created_at desc);
grant select on public.event_messages to anon, authenticated;
grant delete on public.event_messages to authenticated;
grant all on public.event_messages to service_role;
alter table public.event_messages enable row level security;

drop policy if exists "Anyone reads event chat" on public.event_messages;
create policy "Anyone reads event chat" on public.event_messages for select to anon, authenticated using (true);
drop policy if exists "Managers delete event chat" on public.event_messages;
create policy "Managers delete event chat" on public.event_messages for delete to authenticated using (public.can_manage_event(event_id));

create or replace function public.send_event_message(_event_id uuid, _nick text, _body text)
returns public.event_messages
language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(_nick, '')); b text := trim(coalesce(_body, '')); row public.event_messages;
begin
  if char_length(n) < 2 or char_length(n) > 32 then raise exception 'Digite seu nick.' using errcode = 'P0001'; end if;
  if char_length(b) < 1 or char_length(b) > 500 then raise exception 'A mensagem deve ter de 1 a 500 caracteres.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.events where id = _event_id) then raise exception 'Conteúdo não encontrado.' using errcode = 'P0001'; end if;
  if not (
    exists (select 1 from public.signups where event_id = _event_id and lower(nick) = lower(n))
    or exists (select 1 from public.waitlist where event_id = _event_id and lower(nick) = lower(n))
    or exists (select 1 from public.events where id = _event_id and lower(trim(caller_name)) = lower(n))
  ) then raise exception 'Só quem pingou neste conteúdo pode falar no chat.' using errcode = 'P0001'; end if;
  if (select count(*) from public.event_messages where event_id = _event_id and lower(nick) = lower(n) and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Calma! Muitas mensagens seguidas.' using errcode = 'P0001';
  end if;
  insert into public.event_messages (event_id, nick, body) values (_event_id, n, b) returning * into row;
  return row;
end $$;
revoke all on function public.send_event_message(uuid, text, text) from public;
grant execute on function public.send_event_message(uuid, text, text) to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.event_messages;
exception when duplicate_object or undefined_object then null;
end $$;
