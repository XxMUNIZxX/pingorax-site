-- =============================================================================
-- Ícone da arma direto do catálogo (sem baixar/enviar a imagem)
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

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
