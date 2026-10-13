-- =============================================================================
-- Filtros editáveis pelo painel de administração (modos e tipos de conteúdo)
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole tudo > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

create table public.content_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mode', 'type')),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, name)
);
grant select on public.content_options to anon;
grant select, insert, update, delete on public.content_options to authenticated;
grant all on public.content_options to service_role;
alter table public.content_options enable row level security;

create policy "Anyone reads content options" on public.content_options
  for select to anon, authenticated using (true);
create policy "Admins insert content options" on public.content_options
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update content options" on public.content_options
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete content options" on public.content_options
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Valores atuais, para nada mudar de uma hora para outra
insert into public.content_options (kind, name, position) values
  ('mode', 'PVP', 10), ('mode', 'PVE', 20),
  ('type', 'BLACK ZONE', 10), ('type', 'FACÇÃO', 20), ('type', 'AVALON', 30),
  ('type', 'RED ZONE', 40), ('type', 'ZVZ', 50), ('type', 'CTA', 60)
on conflict (kind, name) do nothing;

-- A lista fixa antiga sai de events; quem manda agora é a tabela acima.
alter table public.events drop constraint if exists events_mode_valid;
alter table public.events drop constraint if exists events_content_type_valid;
alter table public.events
  add constraint events_mode_length check (mode is null or char_length(mode) between 1 and 40),
  add constraint events_content_type_length check (content_type is null or char_length(content_type) between 1 and 40);

-- Ao criar ou trocar o modo/tipo de um conteúdo, o valor precisa existir na lista.
-- Conteúdos antigos com um valor que já foi removido continuam editáveis
-- (só valida quando o campo muda).
create or replace function public.validate_event_classification() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.mode is not null and (tg_op = 'INSERT' or new.mode is distinct from old.mode)
     and not exists (select 1 from public.content_options where kind = 'mode' and name = new.mode) then
    raise exception 'Modo inválido: %', new.mode using errcode = '23514';
  end if;
  if new.content_type is not null and (tg_op = 'INSERT' or new.content_type is distinct from old.content_type)
     and not exists (select 1 from public.content_options where kind = 'type' and name = new.content_type) then
    raise exception 'Tipo de conteúdo inválido: %', new.content_type using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger validate_event_classification before insert or update on public.events
  for each row execute function public.validate_event_classification();

-- Renomear uma opção também atualiza os conteúdos que já a usam.
-- Retorna: ok | not_found | invalid | duplicate
create or replace function public.admin_rename_content_option(_id uuid, _name text) returns text
language plpgsql security definer set search_path = public
as $$
declare opt public.content_options; clean text := btrim(coalesce(_name, ''));
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if char_length(clean) not between 1 and 40 then return 'invalid'; end if;
  select * into opt from public.content_options where id = _id for update;
  if opt.id is null then return 'not_found'; end if;
  if clean = opt.name then return 'ok'; end if;
  if exists (select 1 from public.content_options where kind = opt.kind and name = clean) then
    return 'duplicate';
  end if;
  update public.content_options set name = clean where id = _id;
  if opt.kind = 'mode' then
    update public.events set mode = clean where mode = opt.name;
  else
    update public.events set content_type = clean where content_type = opt.name;
  end if;
  return 'ok';
end; $$;
revoke all on function public.admin_rename_content_option(uuid, text) from public, anon;
grant execute on function public.admin_rename_content_option(uuid, text) to authenticated;
