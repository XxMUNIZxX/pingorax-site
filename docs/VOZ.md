# Voz e compartilhamento de tela nos conteúdos

Cada conteúdo tem uma sala de voz com compartilhamento de tela, na própria página. Só entra quem pingou
(inscrito ou na fila), o caller e quem gerencia o conteúdo. O áudio e a tela passam por um servidor de
mídia chamado **LiveKit** (o site gera só a chave de acesso). Enquanto o LiveKit não estiver configurado,
a sala simplesmente não aparece e o resto do site funciona normal.

## Ligar (uma vez)

1. Crie uma conta e um projeto em https://cloud.livekit.io (tem plano gratuito; confira os limites atuais na página de preços).
2. No projeto, copie a **URL** (começa com `wss://`), e crie uma **API key** e o **secret** em *Settings → Keys*.
3. Na Cloudflare: *Workers & Pages → pingorax → Settings → Variables and secrets* e cadastre:
   - `LIVEKIT_URL` = a URL `wss://...`
   - `LIVEKIT_API_KEY` = a key
   - `LIVEKIT_API_SECRET` = o secret (como **Secret**, nunca como texto)
4. Faça um novo deploy (ou espere o próximo). Abra um conteúdo em que você pingou: aparece a **Sala do conteúdo**, com o chat e a sala de voz.

## Notas

- A chave de acesso vale 4 horas e só para a sala daquele conteúdo.
- Compartilhar tela e microfone exigem HTTPS e a permissão do navegador (já é o caso em pingorax.online).
- Quem quiser trocar o LiveKit por outro serviço só precisa mexer em `src/lib/voice.server.ts`, `src/lib/voice.functions.ts` e `src/components/use-voice.ts`.

## Sala do conteúdo (estilo Discord)

- À esquerda ficam os canais: o **chat** e a **sala de voz** (com quem está nela; quem fala ganha um anel verde). Embaixo, o seu painel: microfone, fone (ensurdecer), ajustes, compartilhar tela e sair.
- **Clique no nome de alguém** na sala para ajustar o volume dessa pessoa (0 a 200%).
- **Ajustes de voz** (engrenagem): microfone e fone/caixa de som (troca na hora), teste de microfone com barra de nível, volume geral, supressão de ruído, cancelamento de eco, ajuste automático de ganho, e o modo do microfone: **aberto** ou **aperte para falar** (tecla à sua escolha e atraso ao soltar).
- Os ajustes ficam salvos só no navegador de cada pessoa.
- Limites do navegador: o "aperte para falar" só funciona com a aba do PingoraX em foco (não vale com o jogo na frente) e não dispara enquanto você digita no chat; escolher a saída de som funciona no Chrome e no Edge, não no Firefox e no Safari.

O chat pode ser limpo para reutilizar o conteúdo (veja "Limpar para reutilizar o conteúdo" em `docs/LOOT.md`). A voz não guarda nada: ao sair da sala não sobra registro.
