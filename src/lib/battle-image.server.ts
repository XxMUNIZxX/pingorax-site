import { fameShort, gameDate, type BattleDetail } from "@/lib/albion-types";
import { AMBER, BG, BORDER, CARD, FG, MUTED, PRIMARY, box, encodePng, fill, fit, text, type Img } from "@/lib/kill-image.server";

// Resumo da batalha em imagem, no mesmo visual da página do site. Só usa o placar (sem ícones), então é rápido.

const W = 700, PAD = 28, ROW = 30;
const BAR: number[] = [30, 52, 86];


/** Imagem-resumo da batalha: totais, guildas/alianças e destaques por fama. */
export function renderBattleImage(battle: BattleDetail): Promise<Uint8Array> {
  const groups = (battle.guilds.length ? battle.guilds : battle.alliances).slice(0, 6);
  const topPlayers = [...battle.players].sort((a, b) => b.fame - a.fame).slice(0, 8);
  const H = PAD + 40 + 14 + 70 + 22 + 26 + groups.length * ROW + 22 + 26 + topPlayers.length * ROW + PAD;
  const img: Img = { w: W, h: H, px: new Uint8ClampedArray(W * H * 4) };
  fill(img, 0, 0, W, H, BG);
  box(img, 6, 6, W - 12, H - 12, CARD, BORDER);

  // Título e hora
  let y = PAD;
  text(img, `BATALHA ${battle.id}`, PAD, y, 3, PRIMARY);
  const when = gameDate(battle.startTime);
  const zone = { timeZone: "America/Sao_Paulo" } as const;
  text(img, `${when.toLocaleDateString("pt-BR", { ...zone, day: "2-digit", month: "2-digit", year: "numeric" })} ${when.toLocaleTimeString("pt-BR", { ...zone, hour: "2-digit", minute: "2-digit", hour12: false })}`, W - PAD, y + 4, 2, MUTED, "right");
  y += 40 + 14;

  // Três totais
  const tileW = Math.floor((W - PAD * 2 - 24) / 3);
  [["JOGADORES", String(battle.players.length), FG], ["KILLS", String(battle.totalKills), FG], ["FAMA", fameShort(battle.totalFame), AMBER]].forEach(([label, value, color], i) => {
    const x = PAD + i * (tileW + 12);
    box(img, x, y, tileW, 70, [14, 17, 27], BORDER);
    text(img, label as string, x + 14, y + 12, 2, MUTED);
    text(img, value as string, x + 14, y + 38, 3, color as number[]);
  });
  y += 70 + 22;

  // Colunas (alinhadas à direita)
  const col = { jog: W - PAD - 270, k: W - PAD - 205, m: W - PAD - 140, fame: W - PAD - 8 };
  const header = (title: string) => {
    text(img, title, PAD, y, 2, MUTED);
    text(img, "JOG", col.jog, y, 2, MUTED, "right"); text(img, "K", col.k, y, 2, MUTED, "right");
    text(img, "M", col.m, y, 2, MUTED, "right"); text(img, "FAMA", col.fame, y, 2, MUTED, "right");
    y += 26;
  };
  header(battle.guilds.length ? "GUILDAS" : "ALIANCAS");
  const maxFame = Math.max(1, ...groups.map((g) => g.fame));
  for (const g of groups) {
    fill(img, PAD, y - 3, Math.max(4, Math.round(((W - PAD * 2) * g.fame) / maxFame)), ROW - 4, BAR);
    const tag = "alliance" in g && g.alliance ? `[${g.alliance}] ` : "";
    text(img, fit(`${tag}${g.name}`, col.jog - PAD - 50, 2), PAD + 8, y + 2, 2, FG);
    text(img, String(g.players), col.jog, y + 2, 2, MUTED, "right");
    text(img, String(g.kills), col.k, y + 2, 2, [74, 222, 128], "right");
    text(img, String(g.deaths), col.m, y + 2, 2, [248, 113, 113], "right");
    text(img, fameShort(g.fame), col.fame, y + 2, 2, AMBER, "right");
    y += ROW;
  }
  y += 22;
  text(img, "DESTAQUES POR FAMA", PAD, y, 2, MUTED);
  text(img, "K", col.k, y, 2, MUTED, "right"); text(img, "M", col.m, y, 2, MUTED, "right"); text(img, "FAMA", col.fame, y, 2, MUTED, "right");
  y += 26;
  topPlayers.forEach((p, i) => {
    text(img, String(i + 1), PAD + 8, y + 2, 2, MUTED);
    text(img, fit(p.name, 190, 2), PAD + 40, y + 2, 2, PRIMARY);
    text(img, fit(p.guild || p.alliance || "-", col.k - 40 - (PAD + 240), 2), PAD + 240, y + 2, 2, MUTED);
    text(img, String(p.kills), col.k, y + 2, 2, [74, 222, 128], "right");
    text(img, String(p.deaths), col.m, y + 2, 2, [248, 113, 113], "right");
    text(img, fameShort(p.fame), col.fame, y + 2, 2, AMBER, "right");
    y += ROW;
  });
  return encodePng(img);
}
