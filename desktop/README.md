# PingoraX Logger (app do caller)

App de Windows que lê o jogo (Albion Online) pela rede, mostra o **medidor de dps** e o **loot logger** e envia tudo para o conteúdo no PingoraX.

## Como o caller usa
1. Instale o [Npcap](https://npcap.com/) (marque "WinPcap API-compatible Mode").
2. Instale o PingoraX Logger (arquivo `.exe` da página de Releases do repositório).
3. No site: **Meu perfil → Programa de loot e dps → Criar token**. Cole no app.
4. Escolha o conteúdo e jogue. Dano e loot aparecem no app e vão para o site a cada 15 s (ou em "Enviar agora").

O app só **lê** o tráfego do jogo (não envia nada ao jogo nem altera nada). Mesmo assim, confirme a política da Sandbox antes de distribuir.

## Atualizações
O app confere a página de Releases ao abrir e a cada 4 h. Para publicar uma versão: crie uma tag `vX.Y.Z` no GitHub (ex.: `v0.2.0`); a Action monta o instalador e publica.
Se o jogo atualizar e os códigos de evento mudarem, edite `public/logger-codes.json` do site (ex.: `{"healthUpdate": 7}`); o app busca esse arquivo ao abrir, sem precisar de nova versão. Nomes aceitos: veja `src/core/codes.ts`.

## Desenvolvimento
```
cd desktop
npm install
npm test          # núcleo: decodificador Photon, dano, loot, envio
npm start         # compila e abre (precisa de Windows + Npcap para capturar)
npm run dist      # gera o instalador em release/
```
- `src/core`: código sem dependência de Electron (testado).
- `electron`: janela, captura (cap/Npcap), configurações, atualização.
- `renderer`: tela (mesmas cores e fonte do site).
- `data/event-codes.json`: códigos de evento de referência; `data/items.json`: nomes de itens (lista oficial do jogo).
