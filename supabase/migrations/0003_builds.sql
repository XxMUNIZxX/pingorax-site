-- =============================================================================
-- Builds: catálogo de equipamentos (admin) + builds criadas por qualquer conta
-- + ligação arma do conteúdo -> build.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Catálogo de equipamentos (elmo, armadura, bota, capa, mão secundária, poção, comida, montaria)
-- item_code é o código do item no tier mais alto (ex.: T8_HEAD_PLATE_SET1);
-- a build guarda o tier e o encantamento escolhidos em cima dele.
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

