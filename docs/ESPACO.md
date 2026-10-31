# Espaço da guilda (/sala)

Chat e voz permanentes para cada guilda, só para membros. Fica no menu como **Sala** (aparece para quem está logado).

## Quem é membro
- **Dono**: quem criou a guilda no PingoraX.
- **Moderador**: promovido pelo dono.
- **Membro**: entrou por um link de convite.
- A guilda escolhida no perfil é só uma declaração e **não** dá acesso. Admin do site enxerga e modera todos os espaços.

## O que cada um pode
| | Membro | Moderador | Dono |
|---|---|---|---|
| Ler e escrever, entrar na voz | sim | sim | sim |
| Apagar as próprias mensagens | sim | sim | sim |
| Apagar mensagens de outros, limpar canal | não | sim | sim |
| Criar/apagar canais (máx. 20) | não | sim | sim |
| Gerar convites, remover membros | não | sim | sim |
| Promover/rebaixar moderadores | não | não | sim |

## Convites
Link `/sala?convite=CODIGO`. Vale 7 dias e 25 usos (máx. 10 ativos por guilda). A guilda aceita até 200 membros.

## Canais
Toda guilda tem `#geral` e uma "Sala de voz". Canal de voz é uma sala fixa do LiveKit (`pingorax-canal-<id>`); as variáveis `LIVEKIT_*` são as mesmas da voz dos conteúdos (ver docs/VOZ.md).

## Espaço público
Uma guilda marcada como **aberta** (`guilds.is_open`) aceita qualquer pessoa logada com um clique, sem convite (limite de 2000 membros). Só o administrador do site marca uma guilda como aberta: um gatilho no banco bloqueia os demais. A migração 0025 cria o espaço "PingoraX" (slug `pingorax`) no nome do administrador. A bússola na coluna de guildas lista os espaços públicos.

## Banir
Moderador e dono banem pelo menu do membro: a pessoa sai e não volta nem por convite nem pelo espaço público. O dono é quem bane moderadores. Para desbanir hoje, apague a linha em `guild_bans` (o moderador também consegue pelas regras do banco).

## Ativar
Rodar `supabase/migrations/0024_guild_spaces.sql` e depois `0025_open_space.sql`, uma vez cada, no Supabase. Sem isso a página `/sala` mostra um aviso e o resto do site não muda.

## Ainda não tem
Mensagens não lidas, menções, notificações, imagens, quem está online, denunciar e silenciar, apagar mensagens antigas automaticamente.
