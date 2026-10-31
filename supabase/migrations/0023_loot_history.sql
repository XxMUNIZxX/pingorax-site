-- =============================================================================
-- Histórico de loot: guarda o resultado da divisão quando o caller fecha a sessão,
-- para cada jogador ver no perfil quanto recebeu em cada conteúdo.
-- Pré-requisito: migração 0021 (loot e dps).
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- =============================================================================
do $$ begin
  if to_regclass('public.loot_sessions') is null then raise exception 'Rode antes a migração 0021 (loot e dps).'; end if;
end $$;

alter table public.loot_sessions add column if not exists result jsonb;
