-- =============================================================================
-- Função de cada arma no conteúdo (Tank, Off-Tank, Healer, Support, DPS Melee, DPS Ranged)
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando normalmente, só sem as funções.
-- =============================================================================

alter table public.event_weapons
  add column if not exists role text
  check (role is null or role in ('tank', 'offtank', 'healer', 'support', 'dps_melee', 'dps_ranged'));
