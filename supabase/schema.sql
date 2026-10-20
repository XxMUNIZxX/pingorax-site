-- =============================================================================
-- PingoraX — banco de dados completo (Supabase / Postgres)
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO isto > Run.
-- Rode uma única vez num projeto novo e vazio. O primeiro usuário que criar
-- conta no site vira administrador automaticamente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Papéis
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'user', 'creator');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

-- O primeiro usuário a se cadastrar vira administrador.
create or replace function public.handle_first_admin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(704230);
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created_admin after insert on auth.users
  for each row execute function public.handle_first_admin();

-- Funções de permissão (usadas pelas políticas de segurança abaixo)
create or replace function public.can_create_content() returns boolean
language sql stable security definer set search_path = public
as $$ select public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'creator'); $$;

-- ---------------------------------------------------------------------------
-- Conteúdos (eventos)
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  max_players integer not null default 20 check (max_players > 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  mode text,
  caller_name text,
  content_type text,
  constraint events_mode_length check (mode is null or char_length(mode) between 1 and 40),
  constraint events_content_type_length check (content_type is null or char_length(content_type) between 1 and 40),
  constraint events_caller_name_valid check (caller_name is null or length(trim(caller_name)) between 1 and 80)
);
comment on column public.events.caller_name is 'Nome público do caller; não é identificador de dono nem de autorização';
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;

create or replace function public.can_manage_event(_event_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin')
    or (public.has_role(auth.uid(), 'creator')
        and exists (select 1 from public.events where id = _event_id and created_by = auth.uid()));
$$;

-- O dono do conteúdo nunca pode ser trocado por quem está logado.
create or replace function public.enforce_event_owner() returns trigger
language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    elsif new.created_by is distinct from old.created_by then
      raise exception 'Event owner cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
create trigger enforce_event_owner before insert or update on public.events
  for each row execute function public.enforce_event_owner();

-- ---------------------------------------------------------------------------
-- Armas de cada conteúdo
-- ---------------------------------------------------------------------------
create table public.event_weapons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  slots integer not null default 1 check (slots > 0),
  position integer not null default 0,
  icon_path text,
  constraint event_weapons_icon_path_format check (
    icon_path is null or (length(icon_path) <= 200 and icon_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.png$')
  )
);
grant select on public.event_weapons to anon, authenticated;
grant insert, update, delete on public.event_weapons to authenticated;
grant all on public.event_weapons to service_role;
alter table public.event_weapons enable row level security;

-- ---------------------------------------------------------------------------
-- Inscrições (pings)
-- ---------------------------------------------------------------------------
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  weapon_id uuid not null references public.event_weapons(id) on delete cascade,
  nick text not null check (char_length(nick) between 2 and 32),
  created_at timestamptz not null default now(),
  unique (event_id, nick)
);
grant select, insert on public.signups to anon, authenticated;
grant delete on public.signups to authenticated;
grant all on public.signups to service_role;
alter table public.signups enable row level security;

-- Valida a inscrição. O lock por conteúdo evita que duas pessoas peguem a
-- última vaga ao mesmo tempo.
create or replace function public.validate_signup() returns trigger
language plpgsql security definer set search_path = public
as $$
declare ev public.events; w public.event_weapons;
begin
  perform pg_advisory_xact_lock(hashtext(new.event_id::text));
  select * into ev from public.events where id = new.event_id;
  select * into w from public.event_weapons where id = new.weapon_id;
  if ev.id is null or w.id is null then raise exception 'Conteúdo ou arma não encontrados'; end if;
  if w.event_id is distinct from new.event_id then raise exception 'Arma inválida para este conteúdo'; end if;
  if (select count(*) from public.signups where event_id = new.event_id) >= ev.max_players then
    raise exception 'Conteúdo lotado'; end if;
  if (select count(*) from public.signups where weapon_id = new.weapon_id) >= w.slots then
    raise exception 'Vagas dessa arma esgotadas'; end if;
  new.nick := trim(new.nick);
  return new;
end; $$;
create trigger validate_signup_trg before insert on public.signups
  for each row execute function public.validate_signup();

alter publication supabase_realtime add table public.signups;

-- ---------------------------------------------------------------------------
-- Editores convidados por conteúdo
-- ---------------------------------------------------------------------------
create table public.event_editors (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  granted_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_editors_user_id_idx on public.event_editors(user_id);
grant select on public.event_editors to authenticated;
grant all on public.event_editors to service_role;
alter table public.event_editors enable row level security;
create policy "Editors and owners read event grants" on public.event_editors
  for select to authenticated using (user_id = auth.uid() or public.can_manage_event(event_id));

create function public.can_edit_event(_event_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.can_manage_event(_event_id)
    or exists (select 1 from public.event_editors where event_id = _event_id and user_id = auth.uid())
  );
$$;

create function public.can_access_content_panel() returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.can_create_content()
    or exists (select 1 from public.event_editors where user_id = auth.uid())
  );
$$;

create function public.managed_event_ids() returns table (id uuid)
language sql stable security definer set search_path = public
as $$ select e.id from public.events e where public.can_edit_event(e.id); $$;

create function public.event_editor_directory(_event_id uuid)
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_manage_event(_event_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select ee.user_id, u.email::text, ee.created_at
    from public.event_editors ee join auth.users u on u.id = ee.user_id
    where ee.event_id = _event_id order by ee.created_at;
end; $$;

create function public.grant_event_editor(_event_id uuid, _email text) returns text
language plpgsql security definer set search_path = public
as $$
declare target uuid; owner_id uuid;
begin
  if not public.can_manage_event(_event_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select created_by into owner_id from public.events where id = _event_id;
  if owner_id is null then raise exception 'Conteúdo não encontrado'; end if;
  select id into target from auth.users
    where lower(email) = lower(trim(_email)) and email_confirmed_at is not null limit 1;
  if target is null then return 'not_found'; end if;
  if target = owner_id then return 'owner'; end if;
  insert into public.event_editors (event_id, user_id, granted_by)
    values (_event_id, target, auth.uid()) on conflict (event_id, user_id) do nothing;
  return 'ok';
end; $$;

create function public.revoke_event_editor(_event_id uuid, _user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.can_manage_event(_event_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  delete from public.event_editors where event_id = _event_id and user_id = _user_id;
end; $$;

-- ---------------------------------------------------------------------------
-- Políticas de segurança (quem pode ver e mexer em quê)
-- ---------------------------------------------------------------------------
-- events
create policy "Anyone can view events" on public.events
  for select to anon, authenticated using (true);
create policy "Approved users create own events" on public.events
  for insert to authenticated with check (public.can_create_content() and created_by = auth.uid());
create policy "Owners and admins update events" on public.events
  for update to authenticated using (public.can_manage_event(id)) with check (public.can_manage_event(id));
create policy "Delegated editors update events" on public.events
  for update to authenticated using (public.can_edit_event(id)) with check (public.can_edit_event(id));
create policy "Owners and admins delete events" on public.events
  for delete to authenticated using (public.can_manage_event(id));

-- event_weapons
create policy "Anyone can view weapons" on public.event_weapons
  for select to anon, authenticated using (true);
create policy "Owners and admins manage weapons" on public.event_weapons
  for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));
create policy "Delegated editors manage weapons" on public.event_weapons
  for all to authenticated using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));

-- signups
create policy "Anyone can view signups" on public.signups
  for select to anon, authenticated using (true);
create policy "Anyone can sign up" on public.signups
  for insert to anon, authenticated with check (true);
create policy "Owners and admins remove signups" on public.signups
  for delete to authenticated using (public.can_manage_event(event_id));
create policy "Delegated editors remove signups" on public.signups
  for delete to authenticated using (public.can_edit_event(event_id));

-- ---------------------------------------------------------------------------
-- Equipe (administração)
-- ---------------------------------------------------------------------------
create function public.admin_panel_directory()
returns table (user_id uuid, email text, is_admin boolean, is_creator boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, public.has_role(u.id, 'admin'), public.has_role(u.id, 'creator'), u.created_at
    from auth.users u order by u.created_at;
end; $$;

create function public.admin_set_panel_role(_email text, _role public.app_role, _grant boolean) returns text
language plpgsql security definer set search_path = public
as $$
declare target uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if _role not in ('admin', 'creator') then raise exception 'Invalid role'; end if;
  perform pg_advisory_xact_lock(704231);
  select u.id into target from auth.users u where lower(u.email) = lower(trim(_email)) limit 1;
  if target is null then return 'not_found'; end if;
  if _role = 'admin' and not _grant then
    if target = auth.uid() then return 'self'; end if;
    if (select count(*) from public.user_roles where role = 'admin') <= 1 then return 'last'; end if;
  end if;
  if _grant then
    insert into public.user_roles (user_id, role) values (target, _role) on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = target and role = _role;
  end if;
  return 'ok';
end; $$;

-- ---------------------------------------------------------------------------
-- Imagem de compartilhamento do site (uma única linha)
-- ---------------------------------------------------------------------------
create table public.site_share_settings (
  id text primary key default 'site' check (id = 'site'),
  image_path text not null check (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  updated_at timestamptz not null default now()
);
grant select on public.site_share_settings to anon;
grant select, insert, update on public.site_share_settings to authenticated;
grant all on public.site_share_settings to service_role;
alter table public.site_share_settings enable row level security;
create policy "Read shared site image" on public.site_share_settings
  for select to anon, authenticated using (id = 'site');
create policy "Admins set shared site image" on public.site_share_settings
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') and split_part(image_path, '/', 1) = auth.uid()::text);
create policy "Admins replace shared site image" on public.site_share_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and split_part(image_path, '/', 1) = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Catálogo de armas
-- ---------------------------------------------------------------------------
create table public.weapon_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  category text check (category is null or char_length(category) <= 40),
  item_code text not null unique check (item_code ~ '^[A-Za-z0-9_@]{2,80}$'),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.weapon_catalog to anon;
grant select, insert, update, delete on public.weapon_catalog to authenticated;
grant all on public.weapon_catalog to service_role;
alter table public.weapon_catalog enable row level security;
create policy "Anyone reads weapon catalog" on public.weapon_catalog
  for select to anon, authenticated using (true);
create policy "Admins insert catalog" on public.weapon_catalog
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update catalog" on public.weapon_catalog
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete catalog" on public.weapon_catalog
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

insert into public.weapon_catalog (name, category, item_code, position) values
('Cria-reis','Espadas','T8_2H_CLAYMORE_AVALON',1010),
('Espada Entalhada','Espadas','T8_2H_CLEAVER_HELL',1020),
('Espada Larga','Espadas','T8_MAIN_SWORD',1030),
('Espadas Duplas','Espadas','T8_2H_DUALSWORD',1040),
('Lâmina Aclarada','Espadas','T8_MAIN_SCIMITAR_MORGANA',1050),
('Lâmina da Infinidade','Espadas','T8_MAIN_SWORD_CRYSTAL',1060),
('Montante','Espadas','T8_2H_CLAYMORE',1070),
('Par de Galatinas','Espadas','T8_2H_DUALSCIMITAR_UNDEAD',1080),
('Alabarda','Machados','T8_2H_HALBERD',2010),
('Chama-corpos','Machados','T8_2H_HALBERD_MORGANA',2020),
('Foice de Cristal','Machados','T8_2H_SCYTHE_CRYSTAL',2030),
('Machado de Guerra','Machados','T8_MAIN_AXE',2040),
('Machadão','Machados','T8_2H_AXE',2050),
('Patas de Urso','Machados','T8_2H_DUALAXE_KEEPER',2060),
('Quebra-reino','Machados','T8_2H_AXE_AVALON',2070),
('Segadeira Infernal','Machados','T8_2H_SCYTHE_HELL',2080),
('Jurador','Maças','T8_2H_DUALMACE_AVALON',3010),
('Mangual','Maças','T8_2H_FLAIL',3020),
('Maça','Maças','T8_MAIN_MACE',3030),
('Maça Cambriana','Maças','T8_2H_MACE_MORGANA',3040),
('Maça de Íncubo','Maças','T8_MAIN_MACE_HELL',3050),
('Maça Pesada','Maças','T8_2H_MACE',3060),
('Maça Pétrea','Maças','T8_MAIN_ROCKMACE_KEEPER',3070),
('Monarca Tempestuoso','Maças','T8_MAIN_MACE_CRYSTAL',3080),
('Grande Martelo','Martelos','T8_2H_HAMMER',4010),
('Guarda-bosques','Martelos','T8_2H_RAM_KEEPER',4020),
('Martelo','Martelos','T8_MAIN_HAMMER',4030),
('Martelo de Batalha','Martelos','T8_2H_POLEHAMMER',4040),
('Martelo Estrondoso','Martelos','T8_2H_HAMMER_CRYSTAL',4050),
('Martelo Fúnebre','Martelos','T8_2H_HAMMER_UNDEAD',4060),
('Martelos de Forja','Martelos','T8_2H_DUALHAMMER_HELL',4070),
('Mão da Justiça','Martelos','T8_2H_HAMMER_AVALON',4080),
('Alvorada','Lanças','T8_MAIN_SPEAR_LANCE_AVALON',5010),
('Archa Fraturada','Lanças','T8_2H_GLAIVE_CRYSTAL',5020),
('Caça-espíritos','Lanças','T8_2H_HARPOON_HELL',5030),
('Glaive','Lanças','T8_2H_GLAIVE',5040),
('Lança','Lanças','T8_MAIN_SPEAR',5050),
('Lança Garceira','Lanças','T8_MAIN_SPEAR_KEEPER',5060),
('Lança Trina','Lanças','T8_2H_TRIDENT_UNDEAD',5070),
('Pique','Lanças','T8_2H_SPEAR',5080),
('Bastão','Bastões','T8_2H_QUARTERSTAFF',6010),
('Buscador do Graal','Bastões','T8_2H_QUARTERSTAFF_AVALON',6020),
('Cajado Bilaminado','Bastões','T8_2H_DOUBLEBLADEDSTAFF',6030),
('Cajado de Monge Negro','Bastões','T8_2H_COMBATSTAFF_MORGANA',6040),
('Cajado do Equilíbrio','Bastões','T8_2H_ROCKSTAFF_KEEPER',6050),
('Cajado Férreo','Bastões','T8_2H_IRONCLADEDSTAFF',6060),
('Lâminas Gêmeas Fantasmagóricas','Bastões','T8_2H_DOUBLEBLADEDSTAFF_CRYSTAL',6070),
('Seganímica','Bastões','T8_2H_TWINSCYTHE_HELL',6080),
('Adaga','Adagas','T8_MAIN_DAGGER',7010),
('Dessangrador','Adagas','T8_MAIN_RAPIER_MORGANA',7020),
('Fúria Contida','Adagas','T8_2H_DAGGER_KATAR_AVALON',7030),
('Garras','Adagas','T8_2H_CLAWPAIR',7040),
('Gêmeas Aniquiladoras','Adagas','T8_2H_DAGGERPAIR_CRYSTAL',7050),
('Mortíficos','Adagas','T8_2H_DUALSICKLE_UNDEAD',7060),
('Par de Adagas','Adagas','T8_2H_DAGGERPAIR',7070),
('Presa Demoníaca','Adagas','T8_MAIN_DAGGER_HELL',7080),
('Braçadeiras de Batalha','Luvas','T8_2H_KNUCKLES_SET2',8010),
('Braçadeiras Pulsantes','Luvas','T8_2H_KNUCKLES_CRYSTAL',8020),
('Cestus Golpeadores','Luvas','T8_2H_KNUCKLES_MORGANA',8030),
('Luvas de Brigador','Luvas','T8_2H_KNUCKLES_SET1',8040),
('Luvas Ursinas','Luvas','T8_2H_KNUCKLES_KEEPER',8050),
('Manoplas Cravadas','Luvas','T8_2H_KNUCKLES_SET3',8060),
('Mãos Infernais','Luvas','T8_2H_KNUCKLES_HELL',8070),
('Mãos Pretas','Luvas','T8_2H_IRONGAUNTLETS_HELL',8080),
('Punhos de Avalon','Luvas','T8_2H_KNUCKLES_AVALON',8090),
('Arco','Arcos','T8_2H_BOW',9010),
('Arco Badônico','Arcos','T8_2H_BOW_KEEPER',9020),
('Arco de Guerra','Arcos','T8_2H_WARBOW',9030),
('Arco do Andarilho Celeste','Arcos','T8_2H_BOW_CRYSTAL',9040),
('Arco Longo','Arcos','T8_2H_LONGBOW',9050),
('Arco Plangente','Arcos','T8_2H_BOW_HELL',9060),
('Arco Sussurrante','Arcos','T8_2H_LONGBOW_UNDEAD',9070),
('Fura-bruma','Arcos','T8_2H_BOW_AVALON',9080),
('Arco de Cerco','Bestas','T8_2H_CROSSBOWLARGE_MORGANA',10010),
('Besta','Bestas','T8_2H_CROSSBOW',10020),
('Besta Leve','Bestas','T8_MAIN_1HCROSSBOW',10030),
('Besta Pesada','Bestas','T8_2H_CROSSBOWLARGE',10040),
('Detonadores Reluzentes','Bestas','T8_2H_DUALCROSSBOW_CRYSTAL',10050),
('Lança-virotes','Bestas','T8_2H_DUALCROSSBOW_HELL',10060),
('Modelador de Energia','Bestas','T8_2H_CROSSBOW_CANNON_AVALON',10070),
('Repetidor Lamentoso','Bestas','T8_2H_REPEATINGCROSSBOW_UNDEAD',10080),
('Cajado de Fogo','Fogo','T8_MAIN_FIRESTAFF',11010),
('Cajado do Andarilho Flamejante','Fogo','T8_MAIN_FIRESTAFF_CRYSTAL',11020),
('Cajado Fulgurante','Fogo','T8_2H_INFERNOSTAFF_MORGANA',11030),
('Cajado Incendiário','Fogo','T8_MAIN_FIRESTAFF_KEEPER',11040),
('Cajado Infernal','Fogo','T8_2H_INFERNOSTAFF',11050),
('Cajado Sulfuroso','Fogo','T8_2H_FIRESTAFF_HELL',11060),
('Canção da Alvorada','Fogo','T8_2H_FIRE_RINGPAIR_AVALON',11070),
('Grande Cajado de Fogo','Fogo','T8_2H_FIRESTAFF',11080),
('Cajado de Gelo','Gelo','T8_MAIN_FROSTSTAFF',12010),
('Cajado de Sincelo','Gelo','T8_2H_ICEGAUNTLETS_HELL',12020),
('Cajado Enregelante','Gelo','T8_MAIN_FROSTSTAFF_KEEPER',12030),
('Cajado Glacial','Gelo','T8_2H_GLACIALSTAFF',12040),
('Cajado Ártico','Gelo','T8_2H_FROSTSTAFF_CRYSTAL',12050),
('Grande Cajado de Gelo','Gelo','T8_2H_FROSTSTAFF',12060),
('Prisma Geleterno','Gelo','T8_2H_ICECRYSTAL_UNDEAD',12070),
('Uivo Frio','Gelo','T8_MAIN_FROSTSTAFF_AVALON',12080),
('Cajado Arcano','Arcano','T8_MAIN_ARCANESTAFF',13010),
('Cajado Astral','Arcano','T8_2H_ARCANESTAFF_CRYSTAL',13020),
('Cajado Enigmático','Arcano','T8_2H_ENIGMATICSTAFF',13030),
('Cajado Feiticeiro','Arcano','T8_MAIN_ARCANESTAFF_UNDEAD',13040),
('Cajado Oculto','Arcano','T8_2H_ARCANESTAFF_HELL',13050),
('Grande Cajado Arcano','Arcano','T8_2H_ARCANESTAFF',13060),
('Local Malévolo','Arcano','T8_2H_ENIGMATICORB_MORGANA',13070),
('Som Equilibrado','Arcano','T8_2H_ARCANE_RINGPAIR_AVALON',13080),
('Cajado Avivador','Sagrado','T8_MAIN_HOLYSTAFF_MORGANA',14010),
('Cajado Corrompido','Sagrado','T8_2H_HOLYSTAFF_HELL',14020),
('Cajado da Redenção','Sagrado','T8_2H_HOLYSTAFF_UNDEAD',14030),
('Cajado Divino','Sagrado','T8_2H_DIVINESTAFF',14040),
('Cajado Exaltado','Sagrado','T8_2H_HOLYSTAFF_CRYSTAL',14050),
('Cajado Sagrado','Sagrado','T8_MAIN_HOLYSTAFF',14060),
('Grande Cajado Sagrado','Sagrado','T8_2H_HOLYSTAFF',14070),
('Queda Santa','Sagrado','T8_MAIN_HOLYSTAFF_AVALON',14080),
('Cajado da Natureza','Natureza','T8_MAIN_NATURESTAFF',15010),
('Cajado de Crosta Forjada','Natureza','T8_MAIN_NATURESTAFF_CRYSTAL',15020),
('Cajado Druídico','Natureza','T8_MAIN_NATURESTAFF_KEEPER',15030),
('Cajado Pustulento','Natureza','T8_2H_NATURESTAFF_HELL',15040),
('Cajado Rampante','Natureza','T8_2H_NATURESTAFF_KEEPER',15050),
('Cajado Selvagem','Natureza','T8_2H_WILDSTAFF',15060),
('Grande Cajado da Natureza','Natureza','T8_2H_NATURESTAFF',15070),
('Raiz Férrea','Natureza','T8_MAIN_NATURESTAFF_AVALON',15080),
('Cajado Amaldiçoado','Amaldiçoado','T8_MAIN_CURSEDSTAFF',16010),
('Cajado da Danação','Amaldiçoado','T8_2H_CURSEDSTAFF_MORGANA',16020),
('Cajado Demoníaco','Amaldiçoado','T8_2H_DEMONICSTAFF',16030),
('Cajado Execrado','Amaldiçoado','T8_MAIN_CURSEDSTAFF_UNDEAD',16040),
('Cajado Pútrido','Amaldiçoado','T8_MAIN_CURSEDSTAFF_CRYSTAL',16050),
('Caveira Amaldiçoada','Amaldiçoado','T8_2H_SKULLORB_HELL',16060),
('Chama-sombra','Amaldiçoado','T8_MAIN_CURSEDSTAFF_AVALON',16070),
('Grande Cajado Amaldiçoado','Amaldiçoado','T8_2H_CURSEDSTAFF',16080),
('Cajado da Lua de Sangue','Metamorfo','T8_2H_SHAPESHIFTER_MORGANA',17010),
('Cajado Endemoniado','Metamorfo','T8_2H_SHAPESHIFTER_HELL',17020),
('Cajado Enraizado','Metamorfo','T8_2H_SHAPESHIFTER_SET2',17030),
('Cajado Invocador da Luz','Metamorfo','T8_2H_SHAPESHIFTER_AVALON',17040),
('Cajado Metamorfo','Metamorfo','T8_2H_SHAPESHIFTER_SET1',17050),
('Cajado Petrificante','Metamorfo','T8_2H_SHAPESHIFTER_CRYSTAL',17060),
('Cajado Primitivo','Metamorfo','T8_2H_SHAPESHIFTER_SET3',17070),
('Cajado Rúnico da Terra','Metamorfo','T8_2H_SHAPESHIFTER_KEEPER',17080)
on conflict (item_code) do update set position = excluded.position;


-- ---------------------------------------------------------------------------
-- Filtros editáveis pelo painel de administração (modos e tipos de conteúdo)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Permissões de execução das funções
-- ---------------------------------------------------------------------------
revoke all on function
  public.can_create_content(), public.can_manage_event(uuid), public.can_edit_event(uuid),
  public.can_access_content_panel(), public.managed_event_ids(),
  public.event_editor_directory(uuid), public.grant_event_editor(uuid, text),
  public.revoke_event_editor(uuid, uuid), public.admin_panel_directory(),
  public.admin_set_panel_role(text, public.app_role, boolean)
from public, anon;
grant execute on function
  public.can_create_content(), public.can_manage_event(uuid), public.can_edit_event(uuid),
  public.can_access_content_panel(), public.managed_event_ids(),
  public.event_editor_directory(uuid), public.grant_event_editor(uuid, text),
  public.revoke_event_editor(uuid, uuid), public.admin_panel_directory(),
  public.admin_set_panel_role(text, public.app_role, boolean)
to authenticated;

-- ---------------------------------------------------------------------------
-- Armazenamento de imagens (buckets privados)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('weapon-icons', 'weapon-icons', false, 2097152, array['image/png']),
  ('share-images', 'share-images', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- Ícones de armas: jogadores leem, criadores enviam na própria pasta
create policy "Weapon icons readable by players" on storage.objects
  for select to anon, authenticated using (bucket_id = 'weapon-icons');
create policy "Event editors upload own weapon icons" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'weapon-icons' and public.can_access_content_panel()
    and owner_id = auth.uid()::text and (storage.foldername(name))[1] = auth.uid()::text
    and storage.extension(name) = 'png'
    and lower(coalesce(metadata->>'mimetype', 'image/png')) = 'image/png'
  );
create policy "Approved creators remove own weapon icons" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'weapon-icons' and public.can_create_content()
    and (owner_id = auth.uid()::text or public.has_role(auth.uid(), 'admin'))
  );

-- Imagem de compartilhamento: só admin envia; só a imagem escolhida é pública
create policy "Read selected sharing image" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'share-images' and exists (
    select 1 from public.site_share_settings s where s.id = 'site' and s.image_path = name));
create policy "Admins upload own sharing images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'share-images' and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = auth.uid()::text
    and storage.extension(name) = 'jpg' and metadata->>'mimetype' = 'image/jpeg'
    and public.has_role(auth.uid(), 'admin'));
create policy "Admins read own staged sharing images" on storage.objects
  for select to authenticated
  using (bucket_id = 'share-images' and owner_id = auth.uid()::text and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete own unused sharing images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'share-images' and owner_id = auth.uid()::text and public.has_role(auth.uid(), 'admin')
    and not exists (select 1 from public.site_share_settings s where s.image_path = name));

-- ---------------------------------------------------------------------------
-- Builds (migração 0003)
-- ---------------------------------------------------------------------------
create table public.gear_catalog (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in ('helmet','armor','boots','cape','offhand','potion','food','mount')),
  name text not null check (char_length(name) between 1 and 60),
  category text check (category is null or char_length(category) <= 40),
  item_code text not null check (item_code ~ '^T[1-8]_[A-Za-z0-9_]{2,70}$'),
  min_tier smallint not null default 4 check (min_tier between 1 and 8),
  max_tier smallint not null default 8 check (max_tier between 1 and 8),
  max_enchant smallint not null default 4 check (max_enchant between 0 and 4),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check (min_tier <= max_tier),
  unique (slot, item_code)
);
grant select on public.gear_catalog to anon;
grant select, insert, update, delete on public.gear_catalog to authenticated;
grant all on public.gear_catalog to service_role;
alter table public.gear_catalog enable row level security;
create policy "Anyone reads gear catalog" on public.gear_catalog
  for select to anon, authenticated using (true);
create policy "Admins insert gear catalog" on public.gear_catalog
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update gear catalog" on public.gear_catalog
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete gear catalog" on public.gear_catalog
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Builds. Cada slot guarda o código completo do item: T8_HEAD_PLATE_SET1@2
-- ---------------------------------------------------------------------------
create table public.builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  author_name text check (author_name is null or char_length(author_name) between 1 and 40),
  description text check (description is null or char_length(description) <= 500),
  weapon text, helmet text, armor text, boots text, cape text,
  offhand text, potion text, food text, mount text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint builds_item_format check (
    coalesce(weapon,  'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(helmet,  'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(armor,   'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(boots,   'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(cape,    'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(offhand, 'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(potion,  'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(food,    'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$' and
    coalesce(mount,   'T4_X') ~ '^T[1-8]_[A-Za-z0-9_]{1,70}(@[1-4])?$'
  )
);
create index builds_owner_idx on public.builds (owner_id);
grant select on public.builds to anon;
grant select, insert, update, delete on public.builds to authenticated;
grant all on public.builds to service_role;
alter table public.builds enable row level security;
create policy "Anyone reads builds" on public.builds
  for select to anon, authenticated using (true);
create policy "Accounts create own builds" on public.builds
  for insert to authenticated with check (owner_id = auth.uid());
create policy "Owners and admins update builds" on public.builds
  for update to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Owners and admins delete builds" on public.builds
  for delete to authenticated using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Limite por conta (evita spam), dono não muda e updated_at automático.
create or replace function public.builds_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.builds where owner_id = new.owner_id) >= 100 then
      raise exception 'Limite de 100 builds por conta' using errcode = '23514';
    end if;
  else
    new.owner_id := old.owner_id;
    new.updated_at := now();
  end if;
  return new;
end; $$;
create trigger builds_guard_trg before insert or update on public.builds
  for each row execute function public.builds_guard();

-- ---------------------------------------------------------------------------
-- Cada arma de um conteúdo pode apontar para uma build
-- ---------------------------------------------------------------------------
alter table public.event_weapons
  add column build_id uuid references public.builds(id) on delete set null;
create index event_weapons_build_idx on public.event_weapons (build_id);

-- ---------------------------------------------------------------------------
-- Catálogo inicial de equipamentos
-- ---------------------------------------------------------------------------
insert into public.gear_catalog (slot, name, category, item_code, min_tier, max_tier, max_enchant, position) values
('helmet','Capote da Pureza','Tecido','T8_HEAD_CLOTH_AVALON',4,8,4,10),
('helmet','Capote Feérico','Tecido','T8_HEAD_CLOTH_FEY',4,8,4,20),
('helmet','Capote Malévolo','Tecido','T8_HEAD_CLOTH_HELL',4,8,4,30),
('helmet','Capote de Druida','Tecido','T8_HEAD_CLOTH_KEEPER',4,8,4,40),
('helmet','Capote Sectário','Tecido','T8_HEAD_CLOTH_MORGANA',4,8,4,50),
('helmet','Capote Real','Tecido','T8_HEAD_CLOTH_ROYAL',4,8,4,60),
('helmet','Capote de Erudito','Tecido','T8_HEAD_CLOTH_SET1',2,8,4,70),
('helmet','Capote de Clérigo','Tecido','T8_HEAD_CLOTH_SET2',4,8,4,80),
('helmet','Capote de Mago','Tecido','T8_HEAD_CLOTH_SET3',4,8,4,90),
('helmet','Chapéu do Ceifeiro','Coleta','T8_HEAD_GATHERER_FIBER',4,8,4,100),
('helmet','Chapéu do Pescador','Coleta','T8_HEAD_GATHERER_FISH',4,8,4,110),
('helmet','Chapéu do Esfolador','Coleta','T8_HEAD_GATHERER_HIDE',4,8,4,120),
('helmet','Chapéu do Minerador','Coleta','T8_HEAD_GATHERER_ORE',4,8,4,130),
('helmet','Chapéu do Cavouqueiro','Coleta','T8_HEAD_GATHERER_ROCK',4,8,4,140),
('helmet','Chapéu do Lenhador','Coleta','T8_HEAD_GATHERER_WOOD',4,8,4,150),
('helmet','Capuz da Tenacidade','Couro','T8_HEAD_LEATHER_AVALON',4,8,4,160),
('helmet','Capuz Mata-dragões','Couro','T8_HEAD_LEATHER_DRAGON',4,8,4,170),
('helmet','Capuz de Andarilho da Névoa','Couro','T8_HEAD_LEATHER_FEY',4,8,4,180),
('helmet','Capuz Inferial','Couro','T8_HEAD_LEATHER_HELL',4,8,4,190),
('helmet','Capuz de Espreitador','Couro','T8_HEAD_LEATHER_MORGANA',4,8,4,200),
('helmet','Capuz Real','Couro','T8_HEAD_LEATHER_ROYAL',4,8,4,210),
('helmet','Capuz de Mercenário','Couro','T8_HEAD_LEATHER_SET1',1,8,4,220),
('helmet','Capuz de Caçador','Couro','T8_HEAD_LEATHER_SET2',4,8,4,230),
('helmet','Capuz de Assassino','Couro','T8_HEAD_LEATHER_SET3',4,8,4,240),
('helmet','Capuz Espectral','Couro','T8_HEAD_LEATHER_UNDEAD',4,8,4,250),
('helmet','Elmo da Bravura','Placa','T8_HEAD_PLATE_AVALON',4,8,4,260),
('helmet','Elmo de Tecelão do Crepúsculo','Placa','T8_HEAD_PLATE_FEY',4,8,4,270),
('helmet','Elmo Demônio','Placa','T8_HEAD_PLATE_HELL',4,8,4,280),
('helmet','Elmo Judicante','Placa','T8_HEAD_PLATE_KEEPER',4,8,4,290),
('helmet','Dragonknight Helmet','Placa','T8_HEAD_PLATE_PROTOTYPE',8,8,4,300),
('helmet','Elmo Real','Placa','T8_HEAD_PLATE_ROYAL',4,8,4,310),
('helmet','Elmo de Soldado','Placa','T8_HEAD_PLATE_SET1',2,8,4,320),
('helmet','Elmo de Cavaleiro','Placa','T8_HEAD_PLATE_SET2',4,8,4,330),
('helmet','Elmo de Guardião','Placa','T8_HEAD_PLATE_SET3',4,8,4,340),
('helmet','Elmo de Guarda-tumbas','Placa','T8_HEAD_PLATE_UNDEAD',4,8,4,350),
('armor','Robe da Pureza','Tecido','T8_ARMOR_CLOTH_AVALON',4,8,4,10),
('armor','Robe Feérico','Tecido','T8_ARMOR_CLOTH_FEY',4,8,4,20),
('armor','Robe Malévolo','Tecido','T8_ARMOR_CLOTH_HELL',4,8,4,30),
('armor','Robe de Druida','Tecido','T8_ARMOR_CLOTH_KEEPER',4,8,4,40),
('armor','Robe Sectário','Tecido','T8_ARMOR_CLOTH_MORGANA',4,8,4,50),
('armor','Robe Real','Tecido','T8_ARMOR_CLOTH_ROYAL',4,8,4,60),
('armor','Robe de Erudito','Tecido','T8_ARMOR_CLOTH_SET1',2,8,4,70),
('armor','Robe de Clérigo','Tecido','T8_ARMOR_CLOTH_SET2',4,8,4,80),
('armor','Robe de Mago','Tecido','T8_ARMOR_CLOTH_SET3',4,8,4,90),
('armor','Traje do Ceifeiro','Coleta','T8_ARMOR_GATHERER_FIBER',4,8,4,100),
('armor','Traje do Pescador','Coleta','T8_ARMOR_GATHERER_FISH',4,8,4,110),
('armor','Traje do Esfolador','Coleta','T8_ARMOR_GATHERER_HIDE',4,8,4,120),
('armor','Traje do Minerador','Coleta','T8_ARMOR_GATHERER_ORE',4,8,4,130),
('armor','Traje do Cavouqueiro','Coleta','T8_ARMOR_GATHERER_ROCK',4,8,4,140),
('armor','Traje do Lenhador','Coleta','T8_ARMOR_GATHERER_WOOD',4,8,4,150),
('armor','Casaco da Tenacidade','Couro','T8_ARMOR_LEATHER_AVALON',4,8,4,160),
('armor','Casaco Mata-dragões','Couro','T8_ARMOR_LEATHER_DRAGON',4,8,4,170),
('armor','Casaco de Andarilho da Névoa','Couro','T8_ARMOR_LEATHER_FEY',4,8,4,180),
('armor','Casaco Inferial','Couro','T8_ARMOR_LEATHER_HELL',4,8,4,190),
('armor','Casaco de Espreitador','Couro','T8_ARMOR_LEATHER_MORGANA',4,8,4,200),
('armor','Casaco Real','Couro','T8_ARMOR_LEATHER_ROYAL',4,8,4,210),
('armor','Casaco de Mercenário','Couro','T8_ARMOR_LEATHER_SET1',1,8,4,220),
('armor','Casaco de Caçador','Couro','T8_ARMOR_LEATHER_SET2',4,8,4,230),
('armor','Casaco de Assassino','Couro','T8_ARMOR_LEATHER_SET3',4,8,4,240),
('armor','Casaco Espectral','Couro','T8_ARMOR_LEATHER_UNDEAD',4,8,4,250),
('armor','Armadura da Bravura','Placa','T8_ARMOR_PLATE_AVALON',4,8,4,260),
('armor','Armadura de Tecelão do Crepúsculo','Placa','T8_ARMOR_PLATE_FEY',4,8,4,270),
('armor','Armadura Demônia','Placa','T8_ARMOR_PLATE_HELL',4,8,4,280),
('armor','Armadura Judicante','Placa','T8_ARMOR_PLATE_KEEPER',4,8,4,290),
('armor','Dragonknight Armor','Placa','T8_ARMOR_PLATE_PROTOTYPE',8,8,4,300),
('armor','Armadura Real','Placa','T8_ARMOR_PLATE_ROYAL',4,8,4,310),
('armor','Armadura de Soldado','Placa','T8_ARMOR_PLATE_SET1',2,8,4,320),
('armor','Armadura de Cavaleiro','Placa','T8_ARMOR_PLATE_SET2',4,8,4,330),
('armor','Armadura de Guardião','Placa','T8_ARMOR_PLATE_SET3',4,8,4,340),
('armor','Armadura de Guarda-tumbas','Placa','T8_ARMOR_PLATE_UNDEAD',4,8,4,350),
('boots','Sandálias da Pureza','Tecido','T8_SHOES_CLOTH_AVALON',4,8,4,10),
('boots','Sandálias Feéricas','Tecido','T8_SHOES_CLOTH_FEY',4,8,4,20),
('boots','Sandálias Malévolas','Tecido','T8_SHOES_CLOTH_HELL',4,8,4,30),
('boots','Sandálias de Druida','Tecido','T8_SHOES_CLOTH_KEEPER',4,8,4,40),
('boots','Sandálias Sectárias','Tecido','T8_SHOES_CLOTH_MORGANA',4,8,4,50),
('boots','Sandálias Reais','Tecido','T8_SHOES_CLOTH_ROYAL',4,8,4,60),
('boots','Sandálias de Erudito','Tecido','T8_SHOES_CLOTH_SET1',2,8,4,70),
('boots','Sandálias de Clérigo','Tecido','T8_SHOES_CLOTH_SET2',4,8,4,80),
('boots','Sandálias de Mago','Tecido','T8_SHOES_CLOTH_SET3',4,8,4,90),
('boots','Botas de Trabalho do Ceifeiro','Coleta','T8_SHOES_GATHERER_FIBER',4,8,4,100),
('boots','Botas do Pescador','Coleta','T8_SHOES_GATHERER_FISH',4,8,4,110),
('boots','Botas de Trabalho do Esfolador','Coleta','T8_SHOES_GATHERER_HIDE',4,8,4,120),
('boots','Botas de Trabalho do Minerador','Coleta','T8_SHOES_GATHERER_ORE',4,8,4,130),
('boots','Botas de Trabalho do Cavouqueiro','Coleta','T8_SHOES_GATHERER_ROCK',4,8,4,140),
('boots','Botas de Trabalho do Lenhador','Coleta','T8_SHOES_GATHERER_WOOD',4,8,4,150),
('boots','Sapatos da Tenacidade','Couro','T8_SHOES_LEATHER_AVALON',4,8,4,160),
('boots','Sapatos Mata-dragões','Couro','T8_SHOES_LEATHER_DRAGON',4,8,4,170),
('boots','Sapatos de Andarilho da Névoa','Couro','T8_SHOES_LEATHER_FEY',4,8,4,180),
('boots','Sapatos Inferiais','Couro','T8_SHOES_LEATHER_HELL',4,8,4,190),
('boots','Sapatos de Espreitador','Couro','T8_SHOES_LEATHER_MORGANA',4,8,4,200),
('boots','Sapatos Reais','Couro','T8_SHOES_LEATHER_ROYAL',4,8,4,210),
('boots','Sapatos de Mercenário','Couro','T8_SHOES_LEATHER_SET1',1,8,4,220),
('boots','Sapatos de Caçador','Couro','T8_SHOES_LEATHER_SET2',4,8,4,230),
('boots','Sapatos de Assassino','Couro','T8_SHOES_LEATHER_SET3',4,8,4,240),
('boots','Sapatos Espectrais','Couro','T8_SHOES_LEATHER_UNDEAD',4,8,4,250),
('boots','Botas da Bravura','Placa','T8_SHOES_PLATE_AVALON',4,8,4,260),
('boots','Botas de Tecelão do Crepúsculo','Placa','T8_SHOES_PLATE_FEY',4,8,4,270),
('boots','Botas Demônias','Placa','T8_SHOES_PLATE_HELL',4,8,4,280),
('boots','Botas Judicantes','Placa','T8_SHOES_PLATE_KEEPER',4,8,4,290),
('boots','Dragonknight Boots','Placa','T8_SHOES_PLATE_PROTOTYPE',8,8,4,300),
('boots','Botas Reais','Placa','T8_SHOES_PLATE_ROYAL',4,8,4,310),
('boots','Botas de Soldado','Placa','T8_SHOES_PLATE_SET1',2,8,4,320),
('boots','Botas de Cavaleiro','Placa','T8_SHOES_PLATE_SET2',4,8,4,330),
('boots','Botas de Guardião','Placa','T8_SHOES_PLATE_SET3',4,8,4,340),
('boots','Botas de Guarda-tumbas','Placa','T8_SHOES_PLATE_UNDEAD',4,8,4,350),
('cape','Capa Avaloniana','Capas especiais','T8_CAPEITEM_AVALON',4,8,4,10),
('cape','Capa Demoníaca','Capas especiais','T8_CAPEITEM_DEMON',4,8,4,20),
('cape','Capa de Brecilien','Capas de facção','T8_CAPEITEM_FW_BRECILIEN',4,8,4,30),
('cape','Capa de Bridgewatch','Capas de facção','T8_CAPEITEM_FW_BRIDGEWATCH',4,8,4,40),
('cape','Capa de Caerleon','Capas de facção','T8_CAPEITEM_FW_CAERLEON',4,8,4,50),
('cape','Capa de Fort Sterling','Capas de facção','T8_CAPEITEM_FW_FORTSTERLING',4,8,4,60),
('cape','Capa de Lymhurst','Capas de facção','T8_CAPEITEM_FW_LYMHURST',4,8,4,70),
('cape','Capa de Martlock','Capas de facção','T8_CAPEITEM_FW_MARTLOCK',4,8,4,80),
('cape','Capa de Thetford','Capas de facção','T8_CAPEITEM_FW_THETFORD',4,8,4,90),
('cape','Capa Herege','Capas especiais','T8_CAPEITEM_HERETIC',4,8,4,100),
('cape','Capa Protetora','Capas especiais','T8_CAPEITEM_KEEPER',4,8,4,110),
('cape','Capa de Morgana','Capas especiais','T8_CAPEITEM_MORGANA',4,8,4,120),
('cape','Capa de Contrabandista','Capas especiais','T8_CAPEITEM_SMUGGLER',4,8,4,130),
('cape','Capa Morta-Viva','Capas especiais','T8_CAPEITEM_UNDEAD',4,8,4,140),
('offhand','Tomo de Feitiços do Novato','Livros','T2_OFF_BOOK',2,2,0,10),
('offhand','Tomo de Feitiços do Iniciante','Livros','T3_OFF_BOOK',3,3,0,20),
('offhand','Tomo de Feitiços do Adepto','Livros','T4_OFF_BOOK',4,4,4,30),
('offhand','Tomo de Feitiços do Perito','Livros','T5_OFF_BOOK',5,5,4,40),
('offhand','Tomo de Feitiços do Mestre','Livros','T6_OFF_BOOK',6,6,4,50),
('offhand','Tomo de Feitiços do Grão-mestre','Livros','T7_OFF_BOOK',7,7,4,60),
('offhand','Diário de Rosalia','Livros','T8_OFF_BOOK',8,8,4,70),
('offhand','Incensário Celeste','Incensários','T8_OFF_CENSER_AVALON',4,8,4,80),
('offhand','Muisec','Crânios','T8_OFF_DEMONSKULL_HELL',4,8,4,90),
('offhand','Brumário','Chifres','T8_OFF_HORN_KEEPER',4,8,4,100),
('offhand','Bengala Maligna','Bengalas','T8_OFF_JESTERCANE_HELL',4,8,4,110),
('offhand','Lume Críptico','Lamparinas','T8_OFF_LAMP_UNDEAD',4,8,4,120),
('offhand','Olho dos Segredos','Orbes','T8_OFF_ORB_MORGANA',4,8,4,130),
('offhand','Escudo','Escudos','T8_OFF_SHIELD',1,8,4,140),
('offhand','Égide Astral','Escudos','T8_OFF_SHIELD_AVALON',4,8,4,150),
('offhand','Barreira Inquebrável','Escudos','T8_OFF_SHIELD_CRYSTAL',4,8,4,160),
('offhand','Escudo Vampírico','Escudos','T8_OFF_SHIELD_HELL',4,8,4,170),
('offhand','Quebra-rostos','Escudos','T8_OFF_SPIKEDSHIELD_MORGANA',4,8,4,180),
('offhand','Cetro Sagrado','Outros','T8_OFF_TALISMAN_AVALON',4,8,4,190),
('offhand','Grimório Estagnado','Livros','T8_OFF_TOME_CRYSTAL',4,8,4,200),
('offhand','Tocha','Tochas','T8_OFF_TORCH',3,8,4,210),
('offhand','Tocha Chama Azul','Tochas','T8_OFF_TORCH_CRYSTAL',4,8,4,220),
('offhand','Raiz Mestra','Totens','T8_OFF_TOTEM_KEEPER',4,8,4,230),
('offhand','Sarcófago','Escudos','T8_OFF_TOWERSHIELD_UNDEAD',4,8,4,240),
('potion','Poção Ácida Menor','Poções','T3_POTION_ACID',3,3,3,10),
('potion','Poção Ácida','Poções','T5_POTION_ACID',5,5,3,20),
('potion','Poção Ácida Maior','Poções','T7_POTION_ACID',7,7,3,30),
('potion','Poção de Fúria Menor','Poções','T4_POTION_BERSERK',4,4,3,40),
('potion','Poção de Fúria','Poções','T6_POTION_BERSERK',6,6,3,50),
('potion','Poção de Fúria Maior','Poções','T8_POTION_BERSERK',8,8,3,60),
('potion','Poção de Invisibilidade','Poções','T8_POTION_CLEANSE',8,8,3,70),
('potion','Poção Purificadora Menor','Poções','T3_POTION_CLEANSE2',3,3,3,80),
('potion','Poção Purificadora','Poções','T5_POTION_CLEANSE2',5,5,3,90),
('potion','Poção Purificadora Maior','Poções','T7_POTION_CLEANSE2',7,7,3,100),
('potion','Poção Venenosa Menor','Poções','T4_POTION_COOLDOWN',4,4,3,110),
('potion','Poção Venenosa','Poções','T6_POTION_COOLDOWN',6,6,3,120),
('potion','Poção Venenosa Maior','Poções','T8_POTION_COOLDOWN',8,8,3,130),
('potion','Poção de Energia Menor','Poções','T2_POTION_ENERGY',2,2,3,140),
('potion','Poção de Energia','Poções','T4_POTION_ENERGY',4,4,3,150),
('potion','Poção de Energia Maior','Poções','T6_POTION_ENERGY',6,6,3,160),
('potion','Poção de Coleta Menor','Poções','T4_POTION_GATHER',4,4,3,170),
('potion','Poção de Coleta','Poções','T6_POTION_GATHER',6,6,3,180),
('potion','Poção de Coleta Maior','Poções','T8_POTION_GATHER',8,8,3,190),
('potion','Poção de Cura Menor','Poções','T2_POTION_HEAL',2,2,3,200),
('potion','Poção de Cura','Poções','T4_POTION_HEAL',4,4,3,210),
('potion','Poção de Cura Maior','Poções','T6_POTION_HEAL',6,6,3,220),
('potion','Poção Infernal Menor','Poções','T4_POTION_LAVA',4,4,3,230),
('potion','Poção Infernal','Poções','T6_POTION_LAVA',6,6,3,240),
('potion','Poção Infernal Maior','Poções','T8_POTION_LAVA',8,8,3,250),
('potion','Poção Salva-vidas Menor','Poções','T4_POTION_LIFEWARD',4,4,3,260),
('potion','Poção Salva-vidas','Poções','T6_POTION_LIFEWARD',6,6,3,270),
('potion','Poção Salva-vidas Maior','Poções','T8_POTION_LIFEWARD',8,8,3,280),
('potion','Poção Calmante Menor','Poções','T3_POTION_MOB_RESET',3,3,3,290),
('potion','Poção Calmante','Poções','T5_POTION_MOB_RESET',5,5,3,300),
('potion','Poção Calmante Maior','Poções','T7_POTION_MOB_RESET',7,7,3,310),
('potion','Poção de Crescimento Menor','Poções','T3_POTION_REVIVE',3,3,3,320),
('potion','Poção de Crescimento','Poções','T5_POTION_REVIVE',5,5,3,330),
('potion','Poção de Crescimento Maior','Poções','T7_POTION_REVIVE',7,7,3,340),
('potion','Poção Pegajosa Menor','Poções','T3_POTION_SLOWFIELD',3,3,3,350),
('potion','Poção Pegajosa','Poções','T5_POTION_SLOWFIELD',5,5,3,360),
('potion','Poção Pegajosa Maior','Poções','T7_POTION_SLOWFIELD',7,7,3,370),
('potion','Poção de Resistência Menor','Poções','T3_POTION_STONESKIN',3,3,3,380),
('potion','Poção de Resistência','Poções','T5_POTION_STONESKIN',5,5,3,390),
('potion','Poção de Resistência Maior','Poções','T7_POTION_STONESKIN',7,7,3,400),
('potion','Tornado Engarrafado Menor','Poções','T4_POTION_TORNADO',4,4,3,410),
('potion','Tornado Engarrafado','Poções','T6_POTION_TORNADO',6,6,3,420),
('potion','Tornado Engarrafado Maior','Poções','T8_POTION_TORNADO',8,8,3,430),
('food','Peixe Grelhado','Comidas','T1_MEAL_GRILLEDFISH',1,1,0,10),
('food','Omelete de Galinha','Comidas','T3_MEAL_OMELETTE',3,3,3,20),
('food','Omelete de Ganso','Comidas','T5_MEAL_OMELETTE',5,5,3,30),
('food','Omelete de Porco','Comidas','T7_MEAL_OMELETTE',7,7,3,40),
('food','Omelete de Galinha Avaloniano','Comidas','T3_MEAL_OMELETTE_AVALON',3,3,3,50),
('food','Omelete de Ganso Avaloniano','Comidas','T5_MEAL_OMELETTE_AVALON',5,5,3,60),
('food','Omelete de Porco Avaloniano','Comidas','T7_MEAL_OMELETTE_AVALON',7,7,3,70),
('food','Omelete de Leybatana Mansa','Comidas','T3_MEAL_OMELETTE_DRAGONAREA',3,3,3,80),
('food','Omelete de Leybatana Radiante','Comidas','T5_MEAL_OMELETTE_DRAGONAREA',5,5,3,90),
('food','Omelete de Leybatana Dracônica','Comidas','T7_MEAL_OMELETTE_DRAGONAREA',7,7,3,100),
('food','Omelete de Caranguejo do Rio-baixo','Comidas','T3_MEAL_OMELETTE_FISH',3,3,3,110),
('food','Omelete de Caranguejo de Riacho','Comidas','T5_MEAL_OMELETTE_FISH',5,5,3,120),
('food','Omelete de Caranguejo de Poço','Comidas','T7_MEAL_OMELETTE_FISH',7,7,3,130),
('food','Torta de Galinha','Comidas','T3_MEAL_PIE',3,3,3,140),
('food','Torta de Ganso','Comidas','T5_MEAL_PIE',5,5,3,150),
('food','Torta de Porco','Comidas','T7_MEAL_PIE',7,7,3,160),
('food','Torta de Olhofrio das Serras','Comidas','T3_MEAL_PIE_FISH',3,3,3,170),
('food','Torta de Olhocego das Montanhas','Comidas','T5_MEAL_PIE_FISH',5,5,3,180),
('food','Torta de Olhomorto dos Picos','Comidas','T7_MEAL_PIE_FISH',7,7,3,190),
('food','Frango Assado','Comidas','T3_MEAL_ROAST',3,3,3,200),
('food','Ganso Assado','Comidas','T5_MEAL_ROAST',5,5,3,210),
('food','Porco Assado','Comidas','T7_MEAL_ROAST',7,7,3,220),
('food','Pargo Bruma-branca Assado','Comidas','T3_MEAL_ROAST_FISH',3,3,3,230),
('food','Pargo Névoa-clara Assado','Comidas','T5_MEAL_ROAST_FISH',5,5,3,240),
('food','Pargo Neblina-pura Assado','Comidas','T7_MEAL_ROAST_FISH',7,7,3,250),
('food','Salada de Feijão','Comidas','T2_MEAL_SALAD',2,2,3,260),
('food','Salada de Nabo','Comidas','T4_MEAL_SALAD',4,4,3,270),
('food','Salada de Batata','Comidas','T6_MEAL_SALAD',6,6,3,280),
('food','Salada de Lula das Águas rasas','Comidas','T2_MEAL_SALAD_FISH',2,2,3,290),
('food','Salada de Polvo das Águas médias','Comidas','T4_MEAL_SALAD_FISH',4,4,3,300),
('food','Salada de Kraken das Águas profundas','Comidas','T6_MEAL_SALAD_FISH',6,6,3,310),
('food','Sanduíche de Cabra','Comidas','T4_MEAL_SANDWICH',4,4,3,320),
('food','Sanduíche de Carneiro','Comidas','T6_MEAL_SANDWICH',6,6,3,330),
('food','Sanduíche de Carne','Comidas','T8_MEAL_SANDWICH',8,8,3,340),
('food','Sanduíche de Cabra Avaloniano','Comidas','T4_MEAL_SANDWICH_AVALON',4,4,3,350),
('food','Sanduíche de Carneiro Avaloniano','Comidas','T6_MEAL_SANDWICH_AVALON',6,6,3,360),
('food','Sanduíche de Carne Avaloniano','Comidas','T8_MEAL_SANDWICH_AVALON',8,8,3,370),
('food','Sanduíche de Larápio de Pedregulho','Comidas','T4_MEAL_SANDWICH_FISH',4,4,3,380),
('food','Sanduíche de Larápio de Água corrente','Comidas','T6_MEAL_SANDWICH_FISH',6,6,3,390),
('food','Sanduíche de Larápio do Trovão','Comidas','T8_MEAL_SANDWICH_FISH',8,8,3,400),
('food','Salada de Algas','Comidas','T1_MEAL_SEAWEEDSALAD',1,1,0,410),
('food','Sopa de Cenoura','Comidas','T1_MEAL_SOUP',1,1,3,420),
('food','Sopa de Trigo','Comidas','T3_MEAL_SOUP',3,3,3,430),
('food','Sopa de Repolho','Comidas','T5_MEAL_SOUP',5,5,3,440),
('food','Sopa de Mexilhão Esverdeado','Comidas','T1_MEAL_SOUP_FISH',1,1,3,450),
('food','Sopa de Mexilhão de Águas turvas','Comidas','T3_MEAL_SOUP_FISH',3,3,3,460),
('food','Sopa de Mexilhão do Brejo','Comidas','T5_MEAL_SOUP_FISH',5,5,3,470),
('food','Biscoitos de Ovo de Draco','Comidas','T8_MEAL_SPECIAL_FOOD_DRAKE_EGG',8,8,0,480),
('food','Guisado de Cabra','Comidas','T4_MEAL_STEW',4,4,3,490),
('food','Guisado de Carneiro','Comidas','T6_MEAL_STEW',6,6,3,500),
('food','Guisado de Carne','Comidas','T8_MEAL_STEW',8,8,3,510),
('food','Guisado de Cabra Avaloniano','Comidas','T4_MEAL_STEW_AVALON',4,4,3,520),
('food','Guisado de Carneiro Avaloniano','Comidas','T6_MEAL_STEW_AVALON',6,6,3,530),
('food','Guisado de Carne Avaloniano','Comidas','T8_MEAL_STEW_AVALON',8,8,3,540),
('food','Guisado de Enguia Esverdeada','Comidas','T4_MEAL_STEW_FISH',4,4,3,550),
('food','Guisado de Enguia Avermelhada','Comidas','T6_MEAL_STEW_FISH',6,6,3,560),
('food','Guisado de Enguia de Água-podre','Comidas','T8_MEAL_STEW_FISH',8,8,3,570),
('mount','Cavalo Blindado','Montarias','T8_MOUNT_ARMORED_HORSE',5,8,0,10),
('mount','Cavalo de Guerra','Montarias','T8_MOUNT_ARMORED_HORSE_SKIN_01',5,8,0,20),
('mount','Basilisco Venenoso','Montarias','T7_MOUNT_ARMORED_SWAMPDRAGON_BATTLE',7,7,0,30),
('mount','Urso-vil Selado','Montarias','T8_MOUNT_DIREBEAR',8,8,0,40),
('mount','Urso das Neves Selado','Montarias','T5_MOUNT_DIREBEAR_FW_FORTSTERLING',5,5,0,50),
('mount','Urso-polar de Elite','Montarias','T8_MOUNT_DIREBEAR_FW_FORTSTERLING_ELITE',8,8,0,60),
('mount','Javali-vil Selado','Montarias','T7_MOUNT_DIREBOAR',7,7,0,70),
('mount','Javali Selvagem Selado','Montarias','T5_MOUNT_DIREBOAR_FW_LYMHURST',5,5,0,80),
('mount','Javali Selvagem de Elite','Montarias','T8_MOUNT_DIREBOAR_FW_LYMHURST_ELITE',8,8,0,90),
('mount','Lobo-vil','Montarias','T6_MOUNT_DIREWOLF',6,6,0,100),
('mount','Draco Asa de Fogo','Montarias','T8_MOUNT_DRAKE_FIRE',8,8,0,110),
('mount','Carneiro Gelado','Montarias','T6_MOUNT_FROSTRAM_ADC',6,6,0,120),
('mount','Veado Gigante do Adepto','Montarias','T4_MOUNT_GIANTSTAG',4,4,0,130),
('mount','Alce','Montarias','T6_MOUNT_GIANTSTAG_MOOSE',6,6,0,140),
('mount','Lobo-cinzento Selado','Montarias','T5_MOUNT_GREYWOLF_FW_CAERLEON',5,5,0,150),
('mount','Lobo-cinzento de Elite','Montarias','T8_MOUNT_GREYWOLF_FW_CAERLEON_ELITE',8,8,0,160),
('mount','Cavalo de Montar','Montarias','T8_MOUNT_HORSE',3,8,0,170),
('mount','Husky da Neve','Montarias','T7_MOUNT_HUSKY_ADC',7,7,0,180),
('mount','Mamute de Transporte do Ancião','Montarias','T8_MOUNT_MAMMOTH_TRANSPORT',8,8,0,190),
('mount','Ave-moa Selada','Montarias','T5_MOUNT_MOABIRD_FW_BRIDGEWATCH',5,5,0,200),
('mount','Terrorbird de Elite','Montarias','T8_MOUNT_MOABIRD_FW_BRIDGEWATCH_ELITE',8,8,0,210),
('mount','Lagarto de Praga','Montarias','T7_MOUNT_MONITORLIZARD_ADC',7,7,0,220),
('mount','Mula do Novato','Montarias','T2_MOUNT_MULE',2,2,0,230),
('mount','Coruja Mística Selada','Montarias','T5_MOUNT_OWL_FW_BRECILIEN',5,5,0,240),
('mount','Coruja Mística de Elite','Montarias','T8_MOUNT_OWL_FW_BRECILIEN_ELITE',8,8,0,250),
('mount','Boi de Transporte','Montarias','T8_MOUNT_OX',3,8,0,260),
('mount','Cauda-de-Algodão','Montarias','T8_MOUNT_RABBIT_EASTER',8,8,0,270),
('mount','Carneiro Selvagem Selado','Montarias','T5_MOUNT_RAM_FW_MARTLOCK',5,5,0,280),
('mount','Carneiro Selvagem de Elite','Montarias','T8_MOUNT_RAM_FW_MARTLOCK_ELITE',8,8,0,290),
('mount','Balista de Cerco','Montarias','T6_MOUNT_SIEGE_BALLISTA',6,6,0,300),
('mount','Tecedora Infernal','Montarias','T5_MOUNT_SPIDER_HELL',5,5,0,310),
('mount','Tecedora de Almas','Montarias','T8_MOUNT_SPIDER_HELL',8,8,0,320),
('mount','Dragão do Pântano Selado','Montarias','T7_MOUNT_SWAMPDRAGON',7,7,0,330),
('mount','Basilisco Avaloniano','Montarias','T7_MOUNT_SWAMPDRAGON_AVALON_BASILISK',7,7,0,340),
('mount','Basilisco de Fogo','Montarias','T7_MOUNT_SWAMPDRAGON_BATTLE',7,7,0,350),
('mount','Salamandra do Pântano Selada','Montarias','T5_MOUNT_SWAMPDRAGON_FW_THETFORD',5,5,0,360),
('mount','Salamandra do Pântano de Elite','Montarias','T8_MOUNT_SWAMPDRAGON_FW_THETFORD_ELITE',8,8,0,370),
('mount','Terrorbird Selado','Montarias','T7_MOUNT_TERRORBIRD_ADC',7,7,0,380)
on conflict (slot, item_code) do nothing;

-- ---------------------------------------------------------------------------
-- Ícone da arma pelo catálogo (migração 0004)
-- ---------------------------------------------------------------------------
alter table public.event_weapons
  add column icon_code text
  check (icon_code is null or icon_code ~ '^[A-Za-z0-9_@]{2,80}$');

-- Armas de conteúdos que já existem e ainda estão sem imagem: casa pelo nome com o catálogo.
update public.event_weapons ew
   set icon_code = wc.item_code
  from public.weapon_catalog wc
 where ew.icon_path is null
   and ew.icon_code is null
   and lower(btrim(ew.name)) = lower(btrim(wc.name));

-- ---------------------------------------------------------------------------
-- Tipo de conteúdo das builds (migração 0005)
-- ---------------------------------------------------------------------------
alter table public.builds
  add column content_type text
  check (content_type is null or char_length(content_type) between 1 and 40);

-- ---------------------------------------------------------------------------
-- Posts no Discord (migração 0006)
-- ---------------------------------------------------------------------------
create table public.discord_posts (
  event_id uuid primary key references public.events(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{5,25}$'),
  message_id text not null check (message_id ~ '^[0-9]{5,25}$'),
  created_at timestamptz not null default now()
);
grant select on public.discord_posts to anon, authenticated;
grant insert, update, delete on public.discord_posts to authenticated;
grant all on public.discord_posts to service_role;
alter table public.discord_posts enable row level security;

create policy "Anyone reads discord posts" on public.discord_posts
  for select to anon, authenticated using (true);
create policy "Editors manage discord posts" on public.discord_posts
  for all to authenticated
  using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));

-- ---------------------------------------------------------------------------
-- Canais do Discord por criador (migração 0007)
-- ---------------------------------------------------------------------------
create table public.discord_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  guild_id text not null check (guild_id ~ '^[0-9]{5,25}$'),
  channel_id text not null check (channel_id ~ '^[0-9]{5,25}$'),
  label text check (label is null or char_length(label) <= 100),
  created_at timestamptz not null default now(),
  unique (user_id, channel_id)
);
create index discord_channels_user_idx on public.discord_channels (user_id);
grant select, insert, delete on public.discord_channels to authenticated;
grant all on public.discord_channels to service_role;
alter table public.discord_channels enable row level security;

create policy "Owners and admins read discord channels" on public.discord_channels
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Creators connect own discord channels" on public.discord_channels
  for insert to authenticated with check (user_id = auth.uid() and public.can_create_content());
create policy "Owners and admins remove discord channels" on public.discord_channels
  for delete to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Builds em grupo + botão Sair do Discord (migração 0008)
-- ---------------------------------------------------------------------------
create table public.build_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  author_name text check (author_name is null or char_length(author_name) between 1 and 40),
  description text check (description is null or char_length(description) <= 500),
  content_type text check (content_type is null or char_length(content_type) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index build_groups_owner_idx on public.build_groups (owner_id);

create table public.build_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.build_groups(id) on delete cascade,
  build_id uuid not null references public.builds(id) on delete cascade,
  role text check (role is null or char_length(role) between 1 and 40),
  quantity smallint not null default 1 check (quantity between 1 and 50),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, build_id)
);
create index build_group_members_group_idx on public.build_group_members (group_id);
create index build_group_members_build_idx on public.build_group_members (build_id);

grant select on public.build_groups, public.build_group_members to anon;
grant select, insert, update, delete on public.build_groups, public.build_group_members to authenticated;
grant all on public.build_groups, public.build_group_members to service_role;
alter table public.build_groups enable row level security;
alter table public.build_group_members enable row level security;

create policy "Anyone reads build groups" on public.build_groups
  for select to anon, authenticated using (true);
create policy "Accounts create own build groups" on public.build_groups
  for insert to authenticated with check (owner_id = auth.uid());
create policy "Owners and admins update build groups" on public.build_groups
  for update to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Owners and admins delete build groups" on public.build_groups
  for delete to authenticated using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "Anyone reads build group members" on public.build_group_members
  for select to anon, authenticated using (true);
create policy "Group owners manage members" on public.build_group_members
  for all to authenticated
  using (exists (select 1 from public.build_groups g where g.id = group_id
    and (g.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))))
  with check (exists (select 1 from public.build_groups g where g.id = group_id
    and (g.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))));

-- Limites (evita spam), dono não muda e updated_at automático.
create or replace function public.build_groups_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.build_groups where owner_id = new.owner_id) >= 50 then
      raise exception 'Limite de 50 grupos por conta' using errcode = '23514';
    end if;
  else
    new.owner_id := old.owner_id;
    new.updated_at := now();
  end if;
  return new;
end; $$;
create trigger build_groups_guard_trg before insert or update on public.build_groups
  for each row execute function public.build_groups_guard();

create or replace function public.build_group_members_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.build_group_members where group_id = new.group_id) >= 30 then
    raise exception 'Limite de 30 builds por grupo' using errcode = '23514';
  end if;
  return new;
end; $$;
create trigger build_group_members_guard_trg before insert on public.build_group_members
  for each row execute function public.build_group_members_guard();

-- ---------------------------------------------------------------------------
-- Botão "Sair" do Discord: guarda quem pingou pelo Discord (id nunca fica visível
-- para o público) e só deixa remover o ping de quem clicou.
-- ---------------------------------------------------------------------------
create table public.discord_signup_refs (
  signup_id uuid primary key references public.signups(id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{5,25}$')
);
create index discord_signup_refs_user_idx on public.discord_signup_refs (discord_user_id);
alter table public.discord_signup_refs enable row level security;  -- sem policies: só as funções abaixo mexem
grant all on public.discord_signup_refs to service_role;

create or replace function public.discord_signup(p_event uuid, p_weapon uuid, p_nick text, p_discord_user text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_discord_user is null or p_discord_user !~ '^[0-9]{5,25}$' then raise exception 'Usuário do Discord inválido'; end if;
  insert into public.signups (event_id, weapon_id, nick) values (p_event, p_weapon, p_nick) returning id into v_id;
  insert into public.discord_signup_refs (signup_id, discord_user_id) values (v_id, p_discord_user);
end; $$;

create or replace function public.discord_leave(p_event uuid, p_discord_user text)
returns integer language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  if p_discord_user is null or p_discord_user !~ '^[0-9]{5,25}$' then return 0; end if;
  with gone as (
    delete from public.signups s using public.discord_signup_refs r
    where r.signup_id = s.id and s.event_id = p_event and r.discord_user_id = p_discord_user
    returning s.id)
  select count(*) into n from gone;
  return n;
end; $$;

revoke all on function public.discord_signup(uuid, uuid, text, text) from public;
revoke all on function public.discord_leave(uuid, text) from public;
grant execute on function public.discord_signup(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.discord_leave(uuid, text) to anon, authenticated;

-- Função de cada arma no conteúdo (migração 0009)
alter table public.event_weapons
  add column if not exists role text
  check (role is null or role in ('tank', 'offtank', 'healer', 'support', 'dps_melee', 'dps_ranged'));

-- Lembrete automático no Discord (migração 0010)
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
