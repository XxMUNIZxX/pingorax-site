# Loot e dps do conteúdo

Na página de cada conteúdo, quem pingou vê o painel **Loot e dps**; o caller (e os editores do conteúdo) monta e edita.

## Como o caller usa
1. Abra o conteúdo e clique em **Nova sessão** (uma por baú, por dia ou por parte do conteúdo).
2. **Loot:** adicione itens (nome, quantidade, valor de cada) ou cole vários de uma vez, e informe a **prata direta**.
   - Colagem, uma linha por item: `nome; quantidade; valor de cada` ou só `nome; valor`. Aceita `12.500`, `12,500`, `1.5k` e `2m`.
3. **Como dividir** (você decide em cada sessão):
   - **Método:** igual para todos, ou por função (peso de Tank, Healer, DPS etc.).
   - **Guilda:** uma % do total e/ou um valor fixo em prata.
   - **Reparo:** marque "devolver reparo" e informe quanto cada um pagou; isso sai antes da divisão.
   - **Quem entra:** a lista vem de quem pingou; desmarque quem não entra e adicione jogadores extras.
   - **% manual:** para alguém levar uma parte combinada (ex.: o caller 10% do que sobrar), o resto é dividido entre os demais.
4. **Salvar divisão** e **Copiar resumo** (texto pronto para o Discord ou WhatsApp).
5. **Dps:** cole `nick; dano; cura` (cura é opcional). Repetir o nick atualiza o valor.

A conta sempre fecha: total = guilda + reparos + jogadores + sobra. A sobra (prata que não divide certinho) fica à parte, para a guilda.

## Quem vê
Quem pingou (ou está na fila) e quem gerencia o conteúdo. Só o caller e os editores escrevem. Precisa da migração `0021_loot_dps.sql`; sem ela o painel não aparece.

## Próximos passos (ainda não feitos)
- **Programa para o PC** que lê o tráfego do jogo e envia loot e dps sozinho para a sessão (o site já guarda e mostra; falta a ponte).
- Sessão ligada à presença marcada e histórico de loot por jogador.

## Usar o programa do Triky313 (loot logger e medidor de dps)

O programa [AlbionOnline-StatisticsAnalysis](https://github.com/Triky313/AlbionOnline-StatisticsAnalysis) lê o jogo e já tem loot logger e medidor de dps. O PingoraX importa o que ele gera:

- **Loot:** no programa, na aba do loot logger, use **Exportar loot** (JSON ou CSV). No conteúdo, em Loot → **Importar do programa de loot**, escolha o arquivo. Itens iguais da mesma pessoa são somados e o preço estimado do programa vira o valor de cada. Exportar e importar de novo durante o conteúdo atualiza os itens importados, sem duplicar; itens digitados à mão ficam.
- **Dps:** no medidor do programa, use o botão de copiar. No conteúdo, em Dps → **Colar o dps**, cole o texto. Deixe **desligada** a opção de medidor curto do programa (ela copia só a porcentagem, sem o dano).

Depois é só ajustar o método de divisão e usar **Enviar ao Discord**.

## Histórico no perfil

Ao **Fechar sessão**, o site salva a divisão final (quanto cada pessoa recebeu). Em **Meu perfil → Meu loot** cada jogador vê os conteúdos em que recebeu loot e o total. Reabrir a sessão apaga esse resultado até ela ser fechada de novo. Requer a migração `0023_loot_history.sql`.

## Limpar para reutilizar o conteúdo

Para usar o mesmo conteúdo de novo sem sobras da vez anterior:

- **Chat:** botão **Limpar chat** no topo do chat (quem gerencia o conteúdo).
- **Loot:** **Limpar itens** na sessão apaga só os itens; **Zerar dps** apaga só o dps; o botão de lixeira da sessão apaga a sessão inteira (quem edita).
- **Tudo de uma vez:** no fim da página do conteúdo, **Reutilizar este conteúdo** → *Limpar chat*, *Limpar loot e dps* ou *Limpar tudo*.

Quem pingou, as builds e a presença **não** são mexidas. Não dá para desfazer.
