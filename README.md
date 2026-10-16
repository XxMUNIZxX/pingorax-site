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

### Discord em vários servidores

Qualquer criador pode postar no servidor dele:

1. No Developer Portal, aba **Bot**, ligue **Public Bot**. Crie a variável `DISCORD_APP_ID` (Application ID) no Worker.
2. Em `/criar`, como administrador, clique em **Registrar comando /pingorax** (uma vez só).
3. Quem administra o outro servidor adiciona o bot pelo link de convite que aparece em **Discord do meu servidor** e digita `/pingorax conectar` no canal desejado (precisa da permissão *Gerenciar Servidor*). O bot responde com um código que vale 30 minutos.
4. O criador cola o código em **Discord do meu servidor** e passa a escolher esse canal em **Postar no Discord**.

O código é assinado com o token do bot, então não pode ser falsificado, e só quem gerencia o servidor consegue gerá-lo. Em bancos já criados, rode `supabase/migrations/0007_discord_channels.sql`. Sem verificação do app, o Discord limita o bot a cerca de 100 servidores.

### Botão Sair e builds em grupo

- O card do Discord ganhou um botão **Sair**: quem pingou pelo Discord tira o próprio ping com um clique. O sistema guarda o ID do Discord de quem pingou (invisível ao público) para que ninguém remova o ping de outra pessoa. Pings feitos pelo site continuam sendo removidos pelo caller.
- Na aba **Builds → Grupos** dá para montar composições juntando builds já prontas, com papel e quantidade de cada uma.
- Em bancos já criados, rode `supabase/migrations/0008_build_groups_discord_leave.sql` no SQL Editor (depois de fazer o deploy).

### Ícones das armas no card do Discord
O bot cria automaticamente, na primeira vez que posta, um emoji do aplicativo para cada arma (a partir do ícone do Albion). Precisa só de `DISCORD_APP_ID` e `DISCORD_BOT_TOKEN` no Worker. Armas sem ícone do catálogo ficam só com o nome.

## Lutas (kill board)
A aba **Lutas** (`/lutas`) lê a API pública do Albion (sem chave) pelo servidor do site: lista de batalhas por servidor e página de detalhe com placar, jogadores, equipamentos e kills. Não precisa de SQL nem de variáveis novas.

## Kills e comandos do bot
- A aba **Kills** (`/kills`) mostra o feed de kills, busca de jogador (histórico de kills e mortes) e o detalhe de cada kill (equipamento, inventário, participantes), tudo pela API pública do Albion.
- Nas páginas de **Lutas** e de **Kill** há o botão **Enviar ao Discord**, que posta a análise num canal conectado.
- No Discord: `/luta id:<número ou link>` e `/kill id:<número ou link>` (opcional `servidor`) postam o cartão de análise no canal. Depois de atualizar o site, clique em **Registrar comandos do bot** (Criar conteúdo > Discord do meu servidor, só admin) para o Discord conhecer os comandos novos.
