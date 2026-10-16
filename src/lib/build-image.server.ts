import { AMBER, BG, BORDER, CARD, FG, MUTED, PRIMARY, blit, box, encodePng, fill, fit, loadIcons, text, textWidth, type Img } from "@/lib/kill-image.server";

// Imagem de build e de build de grupo, no mesmo visual das imagens de kill e de luta.
// Não importa @/lib/builds de propósito: ele cria o cliente do navegador do Supabase.

export type ImageBuild = { name: string; author_name: string | null; content_type: string | null } & Record<"weapon" | "offhand" | "helmet" | "armor" | "boots" | "cape" | "potion" | "food" | "mount", string | null>;
export type ImageGroupMember = { role: string | null; quantity: number; build: ImageBuild };

type Slot = keyof Omit<ImageBuild, "name" | "author_name" | "content_type">;
// Mesma disposição da aba Builds do site.
const LAYOUT: (Slot | null)[][] = [[null, "helmet", "cape"], ["weapon", "armor", "offhand"], ["potion", "boots", "food"], [null, "mount", null]];
const LIST: [Slot, string][] = [["weapon", "ARMA"], ["offhand", "SECUNDARIA"], ["helmet", "ELMO"], ["armor", "ARMADURA"], ["boots", "BOTA"], ["cape", "CAPA"], ["potion", "POCAO"], ["food", "COMIDA"], ["mount", "MONTARIA"]];
const ALL_SLOTS = LIST.map(([slot]) => slot);

const tierOf = (code: string) => { const m = code.match(/^T([1-8])_.+?(?:@([1-4]))?$/); return m ? `${m[1]}${m[2] ? `.${m[2]}` : ""}` : ""; };

const newImage = (w: number, h: number): Img => {
  const img: Img = { w, h, px: new Uint8ClampedArray(w * h * 4) };
  fill(img, 0, 0, w, h, BG);
  box(img, 6, 6, w - 12, h - 12, CARD, BORDER);
  return img;
};

/** Caixa com os 9 slots da build (tamanho do ícone ajustável). Devolve a largura e a altura usadas. */
function gearBox(img: Img, icons: Map<string, Img | null>, build: ImageBuild, x: number, y: number, cell: number) {
  const step = cell + 4;
  const w = 3 * step - 4 + 16, h = 4 * step - 4 + 16;
  box(img, x, y, w, h, [14, 17, 27], BORDER);
  LAYOUT.forEach((row, r) => row.forEach((slot, c) => {
    if (!slot) return;
    const cx = x + 8 + c * step, cy = y + 8 + r * step;
    box(img, cx - 1, cy - 1, cell + 2, cell + 2, BG, BORDER);
    const code = build[slot];
    const icon = code ? icons.get(code) : null;
    if (code && !icon) fill(img, cx + 8, cy + 8, cell - 16, cell - 16, BORDER);
    if (icon) blit(img, icon, cx, cy, cell);
  }));
  return { w, h };
}

const codesOf = (builds: ImageBuild[], cap = 48) => [...new Set(builds.flatMap((b) => ALL_SLOTS.map((slot) => b[slot]).filter((c): c is string => !!c)))].slice(0, cap);

/** Quebra o texto em até 2 linhas que caibam na largura (palavras inteiras quando der). */
function wrap2(value: string, max: number, scale: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, scale) <= max || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > 2) return [lines[0]!, `${lines.slice(1).join(" ")}`];
  return lines.length ? lines : [""];
}

/** Uma build: ícones à esquerda e lista de itens (com tier) à direita. */
export async function renderBuildImage(build: ImageBuild, nameOf: (code: string) => string): Promise<{ png: Uint8Array; missing: number }> {
  const W = 700, X0 = 24;
  const H = 96 + 284 + 28;
  const img = newImage(W, H);
  const icons = await loadIcons(codesOf([build]));
  const missing = [...icons.values()].filter((icon) => !icon).length;
  text(img, fit(build.name, W - X0 * 2, 3), X0, 24, 3, PRIMARY);
  const meta = [build.author_name && `POR ${build.author_name}`, build.content_type].filter(Boolean).join("  -  ");
  if (meta) text(img, fit(meta, W - X0 * 2, 2), X0, 58, 2, MUTED);
  const { w } = gearBox(img, icons, build, X0, 96, 64);
  const lx = X0 + w + 24, labelW = 132;
  LIST.forEach(([slot, label], i) => {
    const y = 104 + i * 30;
    text(img, label, lx, y, 2, MUTED);
    const code = build[slot];
    if (!code) { text(img, "-", lx + labelW, y, 2, BORDER); return; }
    const tier = tierOf(code);
    text(img, tier, lx + labelW, y, 2, AMBER);
    text(img, fit(nameOf(code), W - X0 - (lx + labelW + 44), 2), lx + labelW + 44, y, 2, FG);
  });
  return { png: await encodePng(img), missing };
}

/** Um grupo de builds: um cartão por build (função, quantidade e equipamento), até 12. */
export async function renderGroupImage(group: { name: string; author_name: string | null }, members: ImageGroupMember[]): Promise<{ png: Uint8Array; missing: number }> {
  const shown = members.slice(0, 12);
  const CELL_SIZE = 56, CARD_W = 3 * (CELL_SIZE + 4) - 4 + 16, GAP = 16, PAD = 24, COLS = 3;
  const HEAD = 92, CARD_H = 74 + 4 * (CELL_SIZE + 4) - 4 + 16;
  const W = PAD * 2 + COLS * CARD_W + (COLS - 1) * GAP;
  const rows = Math.max(1, Math.ceil(shown.length / COLS));
  const H = PAD + HEAD + rows * (CARD_H + GAP) - GAP + PAD;
  const img = newImage(W, H);
  const icons = await loadIcons(codesOf(shown.map((m) => m.build)));
  const missing = [...icons.values()].filter((icon) => !icon).length;
  const players = members.reduce((sum, m) => sum + m.quantity, 0);
  text(img, fit(group.name, W - PAD * 2, 3), PAD, PAD, 3, PRIMARY);
  const sub = [`${members.length} BUILDS`, `${players} JOGADORES`, group.author_name && `POR ${group.author_name}`].filter(Boolean).join("  -  ");
  text(img, fit(sub, W - PAD * 2, 2), PAD, PAD + 36, 2, MUTED);
  shown.forEach((m, i) => {
    const x = PAD + (i % COLS) * (CARD_W + GAP), y = PAD + HEAD + Math.floor(i / COLS) * (CARD_H + GAP);
    const qty = m.quantity > 1 ? `X${m.quantity}` : "";
    text(img, fit(m.role || "BUILD", CARD_W - (qty ? textWidth(qty, 2) + 12 : 0), 2), x + 2, y, 2, PRIMARY);
    if (qty) text(img, qty, x + CARD_W - 2, y, 2, AMBER, "right");
    wrap2(m.build.name, CARD_W, 2).forEach((line, li) => text(img, fit(line, CARD_W, 2), x + 2, y + 22 + li * 20, 2, FG));
    gearBox(img, icons, m.build, x, y + 74, CELL_SIZE);
  });
  return { png: await encodePng(img), missing };
}
