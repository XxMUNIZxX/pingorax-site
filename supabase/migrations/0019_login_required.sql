-- =============================================================================
-- Login obrigatório para pingar e falar no chat.
--
-- - Pingar (signups) e entrar na fila (waitlist): só quem está logado, e só com o NICK DO PRÓPRIO
--   PERFIL (profiles.albion_nick). Ninguém mais consegue pingar com o nick de outra pessoa.
-- - Chat: send_event_message agora usa o nick do perfil de quem está logado (não recebe mais nick).
-- - Os botões do Discord continuam funcionando como antes: passam pelas funções discord_signup e
--   discord_waitlist_join, que já rodam com permissão própria.
--
-- Pré-requisito: a migração 0014 (perfil de usuário) e a 0018 (chat) já rodadas.
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
--
-- Atenção: isto vale para ESCREVER. A leitura dos conteúdos continua aberta no banco, porque o bot
-- do Discord lê com a chave pública; a tela do site é que pede login para ver.
-- =============================================================================

do $$ begin
  if to_regclass('public.profiles') is null then
    raise exception 'Rode antes a migração 0014 (perfil de usuário).';
  end if;
  if to_regclass('public.event_messages') is null then
    raise exception 'Rode antes a migração 0018 (chat do conteúdo).';
  end if;
end $$;

drop policy if exists "Anyone can sign up" on public.signups;
drop policy if exists "Logged users sign up with own nick" on public.signups;
create policy "Logged users sign up with own nick" on public.signups for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and lower(trim(p.albion_nick)) = lower(trim(nick))));
revoke insert on public.signups from anon;

drop policy if exists "Anyone joins waitlist" on public.waitlist;
drop policy if exists "Logged users join waitlist with own nick" on public.waitlist;
create policy "Logged users join waitlist with own nick" on public.waitlist for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and lower(trim(p.albion_nick)) = lower(trim(nick))));
revoke insert on public.waitlist from anon;

drop function if exists public.send_event_message(uuid, text, text);
create or replace function public.send_event_message(_event_id uuid, _body text)
returns public.event_messages
language plpgsql security definer set search_path = public as $$
declare n text; b text := trim(coalesce(_body, '')); row public.event_messages;
begin
  if auth.uid() is null then raise exception 'Entre no site para falar no chat.' using errcode = 'P0001'; end if;
  select trim(albion_nick) into n from public.profiles where user_id = auth.uid();
  if n is null or char_length(n) < 2 then raise exception 'Cadastre seu nick do Albion no perfil.' using errcode = 'P0001'; end if;
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
revoke all on function public.send_event_message(uuid, text) from public, anon;
grant execute on function public.send_event_message(uuid, text) to authenticated;
