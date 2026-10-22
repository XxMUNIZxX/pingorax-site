-- =============================================================================
-- Conteúdo privado de verdade: só abre quem tem o link (ou já pingou, ou gerencia o conteúdo).
--
-- Antes, "privado" só saía das listas: quem usasse a API do Supabase conseguia listar os privados,
-- as inscrições e o chat deles. Agora o banco esconde as linhas de conteúdos privados de quem não
-- tem acesso. Vale para: events, event_weapons, signups, waitlist, event_messages, confirmations
-- e discord_posts.
--
-- Como o link funciona: o site manda o cabeçalho `x-event-link: <id do conteúdo>` ao abrir a página
-- (e o bot do Discord faz o mesmo ao tratar um botão). O código do conteúdo é impossível de adivinhar,
-- então ter o cabeçalho certo equivale a ter o link.
--
-- Quem enxerga um conteúdo privado:
--   1. quem manda o cabeçalho com o id dele (link);
--   2. quem gerencia ou edita o conteúdo (dono, administrador, editor delegado);
--   3. quem já pingou ou está na fila com o nick do próprio perfil;
--   4. o bot, se o servidor tiver SUPABASE_SERVICE_ROLE_KEY (veja docs/PRIVACIDADE.md).
--
-- IMPORTANTE (ordem): faça o DEPLOY do site com este PR ANTES de rodar este SQL. O site antigo não
-- manda o cabeçalho e deixaria de abrir os privados.
--
-- Pré-requisitos: migrações 0015 (privado), 0011 (fila), 0017 (confirmações), 0018 (chat) e 0010 (posts do Discord).
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

do $$
declare missing text := '';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'is_private') then missing := missing || ' 0015(is_private)'; end if;
  if to_regclass('public.waitlist') is null then missing := missing || ' 0011(waitlist)'; end if;
  if to_regclass('public.confirmations') is null then missing := missing || ' 0017(confirmations)'; end if;
  if to_regclass('public.event_messages') is null then missing := missing || ' 0018(chat)'; end if;
  if to_regclass('public.discord_posts') is null then missing := missing || ' discord_posts'; end if;
  if to_regclass('public.profiles') is null then missing := missing || ' 0014(perfil)'; end if;
  if missing <> '' then raise exception 'Rode antes as migrações:%', missing; end if;
end $$;

-- O id do conteúdo mandado no cabeçalho `x-event-link` (vazio se não veio).
create or replace function public.link_event_id() returns text
language sql stable set search_path = public as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-event-link', '')
$$;
grant execute on function public.link_event_id() to anon, authenticated;

-- Este conteúdo pode ser visto por quem está fazendo a consulta?
create or replace function public.can_see_event(_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = _id and (
      not e.is_private
      or e.id::text = public.link_event_id()
      or public.can_manage_event(e.id)
      or public.can_edit_event(e.id)
      or (auth.uid() is not null and exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and p.albion_nick is not null and (
          exists (select 1 from public.signups s where s.event_id = e.id and lower(trim(s.nick)) = lower(trim(p.albion_nick)))
          or exists (select 1 from public.waitlist w where w.event_id = e.id and lower(trim(w.nick)) = lower(trim(p.albion_nick)))
        )
      ))
    )
  )
$$;
grant execute on function public.can_see_event(uuid) to anon, authenticated;

drop policy if exists "Anyone can view events" on public.events;
drop policy if exists "View public or linked events" on public.events;
-- As colunas da própria linha vêm primeiro: ao criar um conteúdo e ler de volta na mesma consulta (insert ... returning),
-- uma função que consulta a tabela ainda não enxergaria a linha nova.
create policy "View public or linked events" on public.events for select to anon, authenticated
  using (not is_private or created_by = auth.uid() or id::text = public.link_event_id() or public.can_see_event(id));

drop policy if exists "Anyone can view weapons" on public.event_weapons;
drop policy if exists "View weapons of visible events" on public.event_weapons;
create policy "View weapons of visible events" on public.event_weapons for select to anon, authenticated using (public.can_see_event(event_id));

drop policy if exists "Anyone can view signups" on public.signups;
drop policy if exists "View signups of visible events" on public.signups;
create policy "View signups of visible events" on public.signups for select to anon, authenticated using (public.can_see_event(event_id));

drop policy if exists "Anyone views waitlist" on public.waitlist;
drop policy if exists "View waitlist of visible events" on public.waitlist;
create policy "View waitlist of visible events" on public.waitlist for select to anon, authenticated using (public.can_see_event(event_id));

drop policy if exists "Anyone reads event chat" on public.event_messages;
drop policy if exists "Read chat of visible events" on public.event_messages;
create policy "Read chat of visible events" on public.event_messages for select to anon, authenticated using (public.can_see_event(event_id));

drop policy if exists "Anyone views confirmations" on public.confirmations;
drop policy if exists "View confirmations of visible events" on public.confirmations;
create policy "View confirmations of visible events" on public.confirmations for select to anon, authenticated using (public.can_see_event(event_id));

drop policy if exists "Anyone reads discord posts" on public.discord_posts;
drop policy if exists "Read posts of visible events" on public.discord_posts;
create policy "Read posts of visible events" on public.discord_posts for select to anon, authenticated using (public.can_see_event(event_id));

-- Conferir depois de rodar (como visitante, sem login, no SQL Editor com role anon):
--   set local role anon; select count(*) from public.events where is_private;   -- deve dar 0
