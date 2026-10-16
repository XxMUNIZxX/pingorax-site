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
const fill = (img: Img, x: number, y: number, w: number, h: number, [r, g, b, a = 255]: number[]) => {
  for (let j = Math.max(0, y); j < Math.min(img.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(img.w, x + w); i++) img.px.set([r!, g!, b!, a], (j * img.w + i) * 4);
};

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

// Fonte mínima 3x5 para números (fama e quantidades).
const GLYPHS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111", ",": "000000000010100", "/": "001001010100100", ":": "000010000010000",
};
function text(img: Img, value: string, x: number, y: number, scale: number, color: number[]) {
  let at = x;
  for (const ch of value) {
    const g = GLYPHS[ch];
    if (g) for (let k = 0; k < 15; k++) if (g[k] === "1") {
      const gx = at + (k % 3) * scale, gy = y + Math.floor(k / 3) * scale;
      fill(img, gx + 1, gy + 1, scale, scale, [0, 0, 0, 255]);
      fill(img, gx, gy, scale, scale, color);
    }
    at += 4 * scale;
  }
}
const textWidth = (value: string, scale: number) => value.length * 4 * scale - scale;

const SKULL = ["..11111..", ".1111111.", "11.111.11", "11.111.11", "1111111111".slice(0, 9), ".1111111.", "..1.1.1..", "..1.1.1.."];
/** Caveira de "morto" num círculo cinza, no meio da imagem. */
function skull(img: Img, cx: number, cy: number) {
  const radius = 28;
  for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (i * i + j * j <= radius * radius) fill(img, cx + i, cy + j, 1, 1, [110, 108, 106]);
  const scale = 4;
  SKULL.forEach((row, y) => [...row].forEach((c, x) => { if (c === "1") fill(img, cx - Math.round((9 * scale) / 2) + x * scale, cy - Math.round((8 * scale) / 2) + y * scale, scale, scale, [250, 250, 250]); }));
}

const CELL = 64, GAP = 4, STEP = CELL + GAP, PAD = 12;
// Mesma arrumação do jogo: 3 colunas por lado.
const LAYOUT: (keyof Gear | null)[][] = [["bag", "helmet", "cape"], ["weapon", "armor", "offhand"], ["food", "boots", "potion"], [null, "mount", null]];
const MAX_INVENTORY = 32;

export const iconUrl = (code: string) => `https://render.albiononline.com/v1/item/${encodeURIComponent(code)}.png?size=${CELL}&quality=1`;

async function loadIcon(code: string): Promise<Img | null> {
  try {
    const response = await fetch(iconUrl(code), { signal: AbortSignal.timeout(5_000), cf: { cacheTtl: 86_400, cacheEverything: true } } as RequestInit);
    if (!response.ok) return null;
    return await decodePng(new Uint8Array(await response.arrayBuffer()));
  } catch { return null; }
}

export async function renderKillImage(kill: KillDetail): Promise<Uint8Array> {
  const inventory = kill.inventory.slice(0, MAX_INVENTORY);
  const invRows = Math.ceil(inventory.length / 8);
  const panel = 3 * STEP, centre = 8 * STEP - 2 * panel;
  const width = PAD * 2 + 8 * STEP - GAP;
  const top = 4 * STEP - GAP;
  const height = PAD * 2 + top + (invRows ? PAD + invRows * STEP - GAP : 0);
  const img: Img = { w: width, h: height, px: new Uint8ClampedArray(width * height * 4) };
  fill(img, 0, 0, width, height, [212, 185, 150]);

  // Ícones únicos (limite baixo para ficar dentro do número de chamadas permitido por requisição).
  const codes = new Set<string>();
  for (const g of [kill.killer.gear, kill.victim.gear]) for (const row of LAYOUT) for (const slot of row) if (slot && g[slot]) codes.add(g[slot]!);
  for (const item of inventory) codes.add(item.type);
  const wanted = [...codes].slice(0, 44);
  const icons = new Map<string, Img | null>(await Promise.all(wanted.map(async (code) => [code, await loadIcon(code)] as const)));

  const cell = (x: number, y: number, code?: string, count = 0) => {
    fill(img, x, y, CELL, CELL, [30, 38, 50]);
    const icon = code ? icons.get(code) : null;
    if (code && !icon) fill(img, x + 6, y + 6, CELL - 12, CELL - 12, [70, 78, 92]);
    if (icon) blit(img, icon, x, y, CELL);
    if (count > 1) { const label = String(count); text(img, label, x + CELL - textWidth(label, 2) - 3, y + CELL - 13, 2, [255, 255, 255]); }
  };
  const side = (gear: Gear, x0: number) => LAYOUT.forEach((row, r) => row.forEach((slot, c) => {
    const x = x0 + c * STEP, y = PAD + r * STEP;
    if (!slot) { fill(img, x, y, CELL, CELL, [196, 166, 128]); return; }
    cell(x, y, gear[slot]);
  }));
  side(kill.killer.gear, PAD);
  side(kill.victim.gear, PAD + panel + centre);

  // Centro (como no killboard do jogo): fama, caveira, data e hora.
  const mid = PAD + panel + Math.round((centre - GAP) / 2);
  const centred = (value: string, y: number, scale: number, color: number[]) => text(img, value, mid - Math.round(textWidth(value, scale) / 2), y, scale, color);
  const fame = kill.fame.toLocaleString("en-US");
  centred(fame, PAD + 34, fame.length > 9 ? 2 : 3, [122, 62, 14]);
  skull(img, mid, PAD + Math.round(top / 2) + 6);
  const when = gameDate(kill.time);
  const zone = { timeZone: "America/Sao_Paulo" } as const;
  centred(when.toLocaleDateString("pt-BR", { ...zone, day: "2-digit", month: "2-digit", year: "numeric" }), PAD + top - 62, 2, [90, 62, 30]);
  centred(when.toLocaleTimeString("pt-BR", { ...zone, hour: "2-digit", minute: "2-digit", hour12: false }), PAD + top - 44, 2, [90, 62, 30]);

  const invTop = PAD + top + PAD;
  inventory.forEach((item, i) => cell(PAD + (i % 8) * STEP, invTop + Math.floor(i / 8) * STEP, item.type, item.count));
  return encodePng(img);
}
