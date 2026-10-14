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
