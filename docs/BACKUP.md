# Backup do banco (Supabase)

O workflow `.github/workflows/backup.yml` exporta o schema `public` toda semana (domingo de manhã) e guarda por **30 dias**,
**criptografado**. O repositório é público, então o arquivo nunca é enviado em claro.

O que entra: eventos, armas, pings, fila, presença, builds, guildas, perfis, funções de acesso etc. (tudo do schema `public`).
O que **não** entra: as contas do login (schema `auth`, com e-mails e senhas) e os arquivos do Storage (ícones das armas, imagem de compartilhamento).
Isso é de propósito: o Supabase cuida do `auth`, e os arquivos você pode baixar do painel se precisar.

## Ligar (uma vez)

1. **Supabase → Connect → Session pooler**: copie a URI (formato `postgresql://postgres.<ref>:<SENHA>@aws-0-<região>.pooler.supabase.com:5432/postgres`) e troque `[YOUR-PASSWORD]` pela senha do banco.
   Use o *Session pooler*, não a conexão direta: o GitHub só alcança IPv4.
2. **Invente uma senha longa** para criptografar (guarde num gerenciador de senhas: sem ela o backup não abre).
3. **GitHub → repositório → Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = a URI do passo 1
   - `BACKUP_PASSPHRASE` = a senha do passo 2
4. **Actions → Backup do banco → Run workflow** para testar na hora. Se os segredos faltarem, o workflow só avisa e não falha.

## Baixar e restaurar

1. Actions → a execução desejada → **Artifacts → backup-banco** (baixa um .zip com o `.sql.gz.gpg`).
2. Abrir:
   ```bash
   gpg --decrypt pingorax-AAAA-MM-DD.sql.gz.gpg | gunzip > pingorax.sql
   ```
3. Restaurar num projeto Supabase **novo/vazio** (nunca por cima do que está no ar sem pensar):
   ```bash
   psql "<URI do banco novo>" -f pingorax.sql
   ```
   Os usuários do login precisam existir no projeto novo (as tabelas apontam para `auth.users`), então esse caminho serve para recuperar dados no mesmo projeto ou com os usuários migrados.

## Conferir também no painel

Supabase → **Database → Backups** mostra os backups do próprio Supabase. Quanto tempo guardam e se dá para restaurar depende do plano (no gratuito não há restauração por ponto no tempo). Este workflow é a segunda cópia, sob o seu controle.
