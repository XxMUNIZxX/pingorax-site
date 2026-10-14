-- =============================================================================
-- Builds: tipo de conteúdo (filtro da aba Builds)
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- =============================================================================

alter table public.builds
  add column content_type text
  check (content_type is null or char_length(content_type) between 1 and 40);
