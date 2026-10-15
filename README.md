# PingoraX

Site para o pessoal "pingar" nos conteúdos de Albion Online: você cria o conteúdo (horário, limite de jogadores, armas e vagas) e cada jogador escolhe a arma e entra com o nick.

Stack: React + TanStack Start + Tailwind, banco/login/imagens no **Supabase**, hospedagem na **Cloudflare Workers**. Não depende do Lovable.

## 1. Criar o banco (Supabase)

1. Crie um projeto em <https://supabase.com> (o plano gratuito serve).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Rode só uma vez, num projeto vazio. Se o seu banco já existia antes dos filtros editáveis, rode apenas `supabase/migrations/0001_content_options.sql`.
3. Em **Authentication → Providers → Email**, deixe o login por email ligado. Se quiser que a pessoa entre sem confirmar o email, desligue "Confirm email" (por padrão ele vem ligado).
4. Em **Authentication → URL Configuration**, coloque o endereço do site em *Site URL* (ex.: `https://pingorax.online`) e o mesmo endereço, com `/**` no fim, em *Redirect URLs*.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable**.

O **primeiro usuário que criar conta no site vira administrador**. Crie a sua conta antes de divulgar o endereço.

## 2. Rodar no seu computador

Precisa de [Node.js 20+](https://nodejs.org).

```sh
npm install
cp .env.example .env          # preencha VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY e VITE_SITE_URL
cp .env.example .dev.vars     # preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY (as linhas comentadas)
npm run dev
```

Outros comandos: `npm run build`, `npm run test`, `npm run lint`, `npm run typecheck`.

## 3. Publicar na Cloudflare

Pelo painel (recomendado, publica sozinho a cada `git push`):

1. Suba este código para um repositório no GitHub.
2. Em <https://dash.cloudflare.com> vá em **Workers & Pages → Create → Import a repository** e escolha o repositório.
3. Comando de build: `npm run build`. Comando de deploy: `npx wrangler deploy`.
4. Em **Variables and secrets** (do build e do Worker) crie estas cinco:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SITE_URL` — usadas na hora do build;
   - `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` — usadas pelo servidor.
5. Em **Settings → Domains & Routes** do Worker, adicione o seu domínio.

Ou pelo terminal: `npx wrangler login` e depois `npm run deploy`.

## 4. Depois de publicar

- Entre em `/admin` → **Imagem de compartilhamento** e envie a imagem que aparece quando o link é colado no Discord/WhatsApp. Enquanto não enviar, o site usa `public/og-banner.jpg`.
- Em `/admin` → **Acessos da equipe** você libera outras pessoas como *criadoras*. A pessoa precisa criar conta antes.
- O **Catálogo de armas** já vem com todas as armas principais e de duas mãos do jogo (137); você pode adicionar mais pelo código do item do Albion.
- Em `/admin` → **Filtros dos conteúdos** você adiciona, renomeia e remove os modos (PVP/PVE) e os tipos de conteúdo que aparecem nos filtros e no editor.

## Como o acesso funciona

| Quem | Pode |
| --- | --- |
| Qualquer pessoa | Ver conteúdos e pingar com a arma escolhida |
| Criador | Criar conteúdos e mexer nos próprios |
| Editor convidado | Editar um conteúdo específico (liberado pelo dono, por email) |
| Administrador | Tudo, incluindo equipe, catálogo e imagem de compartilhamento |

As regras são aplicadas no próprio banco (políticas RLS em `supabase/schema.sql`), não só na tela.

## Discord (opcional): ping por botões

O criador clica em **Postar no Discord** no conteúdo e o bot publica um card no canal, com um botão por arma. Quem clica informa o nick e já fica pingado; a mensagem atualiza as vagas (também quando alguém pinga ou o criador edita pelo site).

1. <https://discord.com/developers/applications> → **New Application**. Em *General Information* copie a **Public Key**.
2. Aba **Bot** → **Reset Token** e copie o token. Em *OAuth2 → URL Generator* marque o escopo `bot` e as permissões **View Channels** e **Send Messages**; abra o link gerado e adicione o bot ao seu servidor.
3. No Discord (modo desenvolvedor ligado) clique com o botão direito no canal → **Copiar ID do canal**.
4. Na Cloudflare, no Worker → **Variables and secrets** crie `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` (como *Secret*) e `DISCORD_CHANNEL_ID`.
5. Em *General Information* do app, cole em **Interactions Endpoint URL**: `https://SEU-SITE/api/public/discord-interactions` e salve (o Discord testa o endereço na hora).
6. Em bancos já criados, rode `supabase/migrations/0006_discord_posts.sql` no SQL Editor.
