import { parseSilver } from "@/lib/loot-split";

// Leitura dos arquivos e textos do programa AlbionOnline-StatisticsAnalysis (Triky313): exportação de loot (JSON ou CSV) e medidor de dps copiado.

export type ImportedItem = { name: string; quantity: number; unit_value: number; looted_by: string | null; external_id: string };
export type TrikyLoot = { items: ImportedItem[]; entries: number; kills: number; ignored: number };

/** "T8_SHOES_LEATHER_ROYAL" -> "T8 Shoes Leather Royal". */
export function prettyItemId(id: string): string {
  return id.replace(/@(\d)/, " .$1").split("_").filter(Boolean).map((p, i) => (i === 0 && /^T\d$/i.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join(" ");
}

type Row = { id: string; name: string | null; quantity: number; value: number; looter: string | null };

function fromJson(text: string): { rows: Row[]; kills: number; ignored: number } | null {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^﻿/, "")); } catch { return null; }
  const entries = (data && typeof data === "object" ? (data as { entries?: unknown }).entries : null);
  if (!Array.isArray(entries)) return null;
  const rows: Row[] = []; let kills = 0, ignored = 0;
  for (const e of entries as Record<string, unknown>[]) {
    if (e?.["type"] === "kill") { kills++; continue; }
    const loot = e?.["loot"] as { looted_by?: { name?: string }; item?: { id?: string; quantity?: number; average_est_market_value?: number } } | undefined;
    const id = loot?.item?.id; const q = Number(loot?.item?.quantity);
    if (typeof id !== "string" || !id || !(q > 0)) { ignored++; continue; }
    rows.push({ id, name: null, quantity: Math.floor(q), value: Math.max(0, Math.round(Number(loot?.item?.average_est_market_value) || 0)), looter: loot?.looted_by?.name?.trim() || null });
  }
  return { rows, kills, ignored };
}

function fromCsv(text: string): { rows: Row[]; kills: number; ignored: number } | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0]?.split(";").map((h) => h.trim());
  if (!header || !header.includes("item_id") || !header.includes("quantity")) return null;
  const col = (n: string) => header.indexOf(n);
  const rows: Row[] = []; let kills = 0, ignored = 0;
  for (const line of lines.slice(1)) {
    const c = line.split(";");
    const id = c[col("item_id")]?.trim() ?? ""; const q = Number((c[col("quantity")] ?? "").replace(",", "."));
    if (!id) { if ((c[col("died")] ?? "").trim()) kills++; else ignored++; continue; }
    if (!(q > 0)) { ignored++; continue; }
    const value = Math.round(Number((c[col("average_est_market_value")] ?? "").replace(",", ".")) || 0);
    rows.push({ id, name: c[col("item_name")]?.trim() || null, quantity: Math.floor(q), value: Math.max(0, value), looter: c[col("looted_by__name")]?.trim() || null });
  }
  return { rows, kills, ignored };
}

/** Lê o loot exportado (JSON schema 2 ou CSV com ";") e soma itens iguais pegos pela mesma pessoa. */
export function parseTrikyLoot(text: string): TrikyLoot | null {
  const parsed = fromJson(text) ?? fromCsv(text);
  if (!parsed) return null;
  const grouped = new Map<string, ImportedItem>();
  for (const r of parsed.rows) {
    const looter = r.looter && r.looter.length >= 2 ? r.looter.slice(0, 32) : null;
    const key = `imp:${r.id}:${looter ?? ""}`.slice(0, 80);
    const name = (r.name && r.name !== r.id ? r.name : prettyItemId(r.id)).slice(0, 80);
    const prev = grouped.get(key);
    if (prev) { prev.quantity += r.quantity; if (r.value > prev.unit_value) prev.unit_value = r.value; }
    else grouped.set(key, { name, quantity: r.quantity, unit_value: r.value, looted_by: looter, external_id: key });
  }
  const items = [...grouped.values()].map((i) => ({ ...i, quantity: Math.min(i.quantity, 100000) }));
  return { items, entries: parsed.rows.length, kills: parsed.kills, ignored: parsed.ignored };
}

/** Linha do medidor copiado pelo programa: "1. Nick: 12345(45.20%)|678.90 DPS". */
const DPS_LINE = /^\s*\d+\.\s*(.+?):\s*([\d.,]+)\s*\(\s*[\d.,]+\s*%\s*\)\s*\|\s*[\d.,]+\s*DPS\s*$/i;
export function parseTrikyDpsLine(line: string): { nick: string; damage: number; healing: number } | null {
  const m = DPS_LINE.exec(line);
  if (!m) return null;
  const nick = m[1]!.trim();
  const raw = m[2]!;
  const damage = Math.round(Number(raw.replace(/\.(?=.*[.,])|,(?=.*[.,])/g, "").replace(",", ".")));
  if (nick.length < 2 || nick.length > 32 || !Number.isFinite(damage) || damage < 0) return null;
  return { nick, damage, healing: 0 };
}
export const looksLikeTrikyDps = (text: string) => text.split(/\r?\n/).some((l) => DPS_LINE.test(l));
export { parseSilver };
