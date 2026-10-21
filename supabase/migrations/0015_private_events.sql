-- =============================================================================
-- Conteúdo privado ("só com o link"): não aparece na página inicial, na lista de conteúdos
-- nem na página da guilda. Quem recebeu o link (ou viu o card no Discord) consegue abrir e pingar.
--
-- Rode UMA vez no Supabase: SQL Editor > New query > cole o CONTEÚDO > Run.
-- Para projetos novos isto já está incluído em supabase/schema.sql.
-- Enquanto isto não for rodado, o site continua funcionando, só sem a opção.
--
-- Atenção: é "não listado", como um vídeo não listado do YouTube. O endereço tem um código
-- impossível de adivinhar, mas quem tiver o link pode repassá-lo.
-- =============================================================================

alter table public.events add column if not exists is_private boolean not null default false;
create index if not exists events_public_idx on public.events (starts_at) where not is_private;
