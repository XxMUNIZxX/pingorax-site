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
4. Faça um novo deploy (ou espere o próximo). Abra um conteúdo em que você pingou: aparece "Voz e tela".

## Notas

- A chave de acesso vale 4 horas e só para a sala daquele conteúdo.
- Compartilhar tela e microfone exigem HTTPS e a permissão do navegador (já é o caso em pingorax.online).
- Quem quiser trocar o LiveKit por outro serviço só precisa mexer em `src/lib/voice.server.ts`, `src/lib/voice.functions.ts` e `src/components/voice-room.tsx`.
