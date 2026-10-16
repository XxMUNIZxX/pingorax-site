import { gameDate, type Gear, type KillDetail } from "@/lib/albion-types";

// Imagem da kill (equipamento dos dois lados, fama e inventário), desenhada aqui mesmo sem nenhuma biblioteca:
// os ícones vêm do serviço de imagens do jogo, são colados num quadro e o PNG é montado com as APIs do Worker.

type Img = { w: number; h: number; px: Uint8ClampedArray };

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

async function pipe(data: Uint8Array, stream: DecompressionStream | CompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data as unknown as BufferSource).then(() => writer.close()).catch(() => undefined);
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Lê um PNG simples (8 bits, sem entrelaçamento), que é o que o serviço de ícones devolve. */
export async function decodePng(bytes: Uint8Array): Promise<Img> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x89504e47) throw new Error("não é PNG");
  let w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  let palette = new Uint8Array(0), trns = new Uint8Array(0);
  const data: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") { w = view.getUint32(at + 8); h = view.getUint32(at + 12); depth = body[8]!; color = body[9]!; interlace = body[12]!; }
    else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || !w || !h || w > 1024 || h > 1024) throw new Error("PNG não suportado");
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
  if (!channels) throw new Error("PNG não suportado");
  const raw = await pipe(concat(data), new DecompressionStream("deflate"));
  const stride = w * channels;
  const rows = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels]! : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels]! : 0;
      let v = raw[src + x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      rows[y * stride + x] = v & 255;
    }
  }
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * channels;
    let r: number, g: number, b: number, a = 255;
    if (color === 6) { r = rows[s]!; g = rows[s + 1]!; b = rows[s + 2]!; a = rows[s + 3]!; }
    else if (color === 2) { r = rows[s]!; g = rows[s + 1]!; b = rows[s + 2]!; }
    else if (color === 3) { const p = rows[s]!; r = palette[p * 3]!; g = palette[p * 3 + 1]!; b = palette[p * 3 + 2]!; a = trns[p] ?? 255; }
    else if (color === 4) { r = g = b = rows[s]!; a = rows[s + 1]!; }
    else { r = g = b = rows[s]!; }
    px.set([r, g, b, a], i * 4);
  }
  return { w, h, px };
}

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export async function encodePng(img: Img): Promise<Uint8Array> {
  const rows = new Uint8Array((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) rows.set(img.px.subarray(y * img.w * 4, (y + 1) * img.w * 4), y * (img.w * 4 + 1) + 1);
  const idat = await pipe(rows, new CompressionStream("deflate"));
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const head = new Uint8Array(13);
  const hv = new DataView(head.buffer);
  hv.setUint32(0, img.w); hv.setUint32(4, img.h); head[8] = 8; head[9] = 6;
  return concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]);
}

// ---- Desenho ----
type Rgb = number[];
// Mesmas cores do site (tema escuro).
const BG: Rgb = [10, 13, 21], CARD: Rgb = [22, 26, 37], BORDER: Rgb = [62, 66, 80], PRIMARY: Rgb = [109, 182, 255], FG: Rgb = [240, 242, 247], MUTED: Rgb = [182, 186, 199], AMBER: Rgb = [251, 191, 36];

const fill = (img: Img, x: number, y: number, w: number, h: number, [r, g, b, a = 255]: Rgb) => {
  for (let j = Math.max(0, y); j < Math.min(img.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(img.w, x + w); i++) img.px.set([r!, g!, b!, a], (j * img.w + i) * 4);
};
const box = (img: Img, x: number, y: number, w: number, h: number, bg: Rgb, border: Rgb) => { fill(img, x, y, w, h, border); fill(img, x + 2, y + 2, w - 4, h - 4, bg); };

/** Cola o ícone (escalado se preciso) sobre o quadro respeitando a transparência. */
function blit(img: Img, icon: Img, x: number, y: number, size: number) {
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const s = (Math.floor((j * icon.h) / size) * icon.w + Math.floor((i * icon.w) / size)) * 4;
    const a = icon.px[s + 3]! / 255;
    if (a === 0) continue;
    const d = ((y + j) * img.w + (x + i)) * 4;
    if (d < 0 || d >= img.px.length) continue;
    for (let c = 0; c < 3; c++) img.px[d + c] = icon.px[s + c]! * a + img.px[d + c]! * (1 - a);
    img.px[d + 3] = 255;
  }
}

// Fonte 5x7 (só maiúsculas, números e pontuação comum); minúsculas viram maiúsculas e acentos são removidos.
const FONT: Record<string, string> = {
  A: "01110 10001 10001 11111 10001 10001 10001", B: "11110 10001 10001 11110 10001 10001 11110", C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110", E: "11111 10000 10000 11110 10000 10000 11111", F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111", H: "10001 10001 10001 11111 10001 10001 10001", I: "01110 00100 00100 00100 00100 00100 01110",
  J: "00111 00010 00010 00010 00010 10010 01100", K: "10001 10010 10100 11000 10100 10010 10001", L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001", N: "10001 11001 10101 10011 10001 10001 10001", O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000", Q: "01110 10001 10001 10001 10101 10010 01101", R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110", T: "11111 00100 00100 00100 00100 00100 00100", U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100", W: "10001 10001 10001 10101 10101 11011 10001", X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100", Z: "11111 00001 00010 00100 01000 10000 11111",
  "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110", "2": "01110 10001 00001 00010 00100 01000 11111",
  "3": "11110 00001 00001 01110 00001 00001 11110", "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
  "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000", "8": "01110 10001 10001 01110 10001 10001 01110",
  "9": "01110 10001 10001 01111 00001 00010 01100",
  ".": "00000 00000 00000 00000 00000 01100 01100", ",": "00000 00000 00000 00000 01100 00100 01000", "-": "00000 00000 00000 11111 00000 00000 00000",
  "[": "01110 01000 01000 01000 01000 01000 01110", "]": "01110 00010 00010 00010 00010 00010 01110", "/": "00001 00001 00010 00100 01000 10000 10000",
  ":": "00000 01100 01100 00000 01100 01100 00000", "'": "00100 00100 01000 00000 00000 00000 00000", "_": "00000 00000 00000 00000 00000 00000 11111",
  "(": "00010 00100 01000 01000 01000 00100 00010", ")": "01000 00100 00010 00010 00010 00100 01000", "?": "01110 10001 00001 00010 00100 00000 00100",
  " ": "00000 00000 00000 00000 00000 00000 00000",
};
const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9.,\-\[\]/:'_() ]/g, "?");
const textWidth = (value: string, scale: number) => (value.length ? value.length * 6 * scale - scale : 0);
/** Corta o texto com "..." para caber na largura. */
function fit(value: string, max: number, scale: number) {
  let out = clean(value);
  if (textWidth(out, scale) <= max) return out;
  while (out.length > 1 && textWidth(`${out}...`, scale) > max) out = out.slice(0, -1);
  return `${out}...`;
}
function text(img: Img, value: string, x: number, y: number, scale: number, color: Rgb, align: "left" | "center" | "right" = "left") {
  const raw = clean(value);
  let at = align === "left" ? x : align === "center" ? x - Math.round(textWidth(raw, scale) / 2) : x - textWidth(raw, scale);
  for (const ch of raw) {
    const rows = (FONT[ch] ?? FONT["?"]!).split(" ");
    rows.forEach((row, ry) => [...row].forEach((bit, rx) => { if (bit === "1") fill(img, at + rx * scale, y + ry * scale, scale, scale, color); }));
    at += 6 * scale;
  }
}

const SKULL = ["..11111..", ".1111111.", "11.111.11", "11.111.11", "111111111", ".1111111.", "..1.1.1..", "..1.1.1.."];
/** Caveira de "morto" num círculo, no meio da imagem. */
function skull(img: Img, cx: number, cy: number) {
  const radius = 24;
  for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (i * i + j * j <= radius * radius) fill(img, cx + i, cy + j, 1, 1, [48, 52, 66]);
  const scale = 3;
  SKULL.forEach((row, y) => [...row].forEach((c, x) => { if (c === "1") fill(img, cx - Math.round((9 * scale) / 2) + x * scale, cy - Math.round((8 * scale) / 2) + y * scale, scale, scale, FG); }));
}

const CELL = 64, GAP = 4, STEP = CELL + GAP;
// Mesma arrumação do jogo e da página: 3 colunas por lado.
const LAYOUT: (keyof Gear | null)[][] = [["bag", "helmet", "cape"], ["weapon", "armor", "offhand"], ["food", "boots", "potion"], [null, "mount", null]];
const MAX_INVENTORY = 32;

export const iconUrl = (code: string) => `https://render.albiononline.com/v1/item/${encodeURIComponent(code)}.png?size=${CELL}&quality=1`;

/** Baixa um ícone; tenta de novo (com outro formato de pedido) porque o serviço de imagens às vezes demora ou falha. */
async function loadIcon(code: string): Promise<Img | null> {
  const variants = [iconUrl(code), `https://render.albiononline.com/v1/item/${encodeURIComponent(code)}.png?size=${CELL}`, iconUrl(code)];
  for (const url of variants) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(9_000), cf: { cacheTtl: 86_400, cacheEverything: true } } as RequestInit);
      if (response.ok) return await decodePng(new Uint8Array(await response.arrayBuffer()));
      console.error("[kill-image] ícone", code, response.status);
    } catch (error) { console.error("[kill-image] ícone", code, String(error)); }
  }
  return null;
}

/** Baixa vários ícones com poucos pedidos ao mesmo tempo (muitos juntos ficam na fila e estouram o tempo). */
async function loadIcons(codes: string[], parallel = 5): Promise<Map<string, Img | null>> {
  const out = new Map<string, Img | null>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, codes.length) }, async () => {
    while (next < codes.length) { const code = codes[next++]!; out.set(code, await loadIcon(code)); }
  }));
  return out;
}

const tagOf = (side: { alliance: string; guild: string }) => [side.alliance && `[${side.alliance}]`, side.guild].filter(Boolean).join(" ") || "sem guilda";

/** Imagem da kill com o visual da página de kill do site. */
export async function renderKillImage(kill: KillDetail): Promise<{ png: Uint8Array; missing: number }> {
  const inventory = kill.inventory.slice(0, MAX_INVENTORY);
  const invRows = Math.ceil(inventory.length / 8);
  const COL = 3 * STEP - GAP + 16, CONTENT = 580, X0 = 24, Y0 = 24;
  const width = CONTENT + X0 * 2;
  const HEADER = 74, BOX_H = 4 * STEP - GAP + 16;
  const invTop = Y0 + HEADER + BOX_H + 38;
  const height = (invRows ? invTop + invRows * STEP - GAP : Y0 + HEADER + BOX_H) + 28;
  const img: Img = { w: width, h: height, px: new Uint8ClampedArray(width * height * 4) };
  fill(img, 0, 0, width, height, BG);
  box(img, 6, 6, width - 12, height - 12, CARD, BORDER);

  // Ícones únicos (limite baixo para ficar dentro do número de chamadas permitido por requisição).
  const codes = new Set<string>();
  for (const g of [kill.killer.gear, kill.victim.gear]) for (const row of LAYOUT) for (const slot of row) if (slot && g[slot]) codes.add(g[slot]!);
  for (const item of inventory) codes.add(item.type);
  const icons = await loadIcons([...codes].slice(0, 44));
  const missing = [...icons.values()].filter((icon) => !icon).length;

  const cell = (x: number, y: number, code?: string, count = 0) => {
    box(img, x - 1, y - 1, CELL + 2, CELL + 2, BG, BORDER);
    const icon = code ? icons.get(code) : null;
    if (code && !icon) fill(img, x + 8, y + 8, CELL - 16, CELL - 16, BORDER);
    if (icon) blit(img, icon, x, y, CELL);
    if (count > 1) { const label = String(count); fill(img, x + CELL - textWidth(label, 2) - 6, y + CELL - 17, textWidth(label, 2) + 6, 17, [0, 0, 0, 255]); text(img, label, x + CELL - 3, y + CELL - 15, 2, FG, "right"); }
  };
  const fighter = (side: typeof kill.killer, boxX: number, align: "left" | "right") => {
    const edge = align === "left" ? boxX : boxX + COL;
    text(img, fit(side.name, COL, 2), edge, Y0 + 4, 2, PRIMARY, align);
    // Tag da aliança + guilda se couber em letra legível; senão, só a guilda (cortada).
    const full = tagOf(side);
    text(img, textWidth(clean(full), 2) <= COL ? full : fit(side.guild || full, COL, 2), edge, Y0 + 28, 2, MUTED, align);
    text(img, side.ip > 0 ? `IP ${side.ip}` : "IP ?", edge, Y0 + 50, 2, MUTED, align);
    const top = Y0 + HEADER;
    box(img, boxX, top, COL, BOX_H, [14, 17, 27], BORDER);
    LAYOUT.forEach((row, r) => row.forEach((slot, c) => { if (slot) cell(boxX + 8 + c * STEP, top + 8 + r * STEP, side.gear[slot]); }));
  };
  const leftX = X0, rightX = X0 + CONTENT - COL, mid = X0 + Math.round(CONTENT / 2);
  fighter(kill.killer, leftX, "left");
  fighter(kill.victim, rightX, "right");

  // Centro, como na página: "matou", fama, caveira, data e hora.
  const top = Y0 + HEADER;
  const fame = kill.fame.toLocaleString("en-US");
  text(img, "MATOU", mid, top + 10, 2, MUTED, "center");
  text(img, fame, mid, top + 40, textWidth(fame, 3) <= 130 ? 3 : 2, AMBER, "center");
  text(img, "FAMA", mid, top + 68, 2, MUTED, "center");
  skull(img, mid, top + 140);
  const when = gameDate(kill.time);
  const zone = { timeZone: "America/Sao_Paulo" } as const;
  text(img, when.toLocaleDateString("pt-BR", { ...zone, day: "2-digit", month: "2-digit", year: "numeric" }), mid, top + BOX_H - 62, 2, MUTED, "center");
  text(img, when.toLocaleTimeString("pt-BR", { ...zone, hour: "2-digit", minute: "2-digit", hour12: false }), mid, top + BOX_H - 42, 2, MUTED, "center");

  if (invRows) {
    text(img, `INVENTARIO DE ${kill.victim.name}`.slice(0, 40), X0, invTop - 26, 2, MUTED);
    const gridX = X0 + Math.round((CONTENT - (8 * STEP - GAP)) / 2);
    inventory.forEach((item, i) => cell(gridX + (i % 8) * STEP, invTop + Math.floor(i / 8) * STEP, item.type, item.count));
  }
  return { png: await encodePng(img), missing };
}
