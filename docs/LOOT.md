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
