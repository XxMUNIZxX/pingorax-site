import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { DEFAULT_SPLIT, type PastedItem, type SplitConfig } from "@/lib/loot-split";

export type LootItem = { id: string; session_id: string; name: string; quantity: number; unit_value: number; looted_by: string | null };
export type DpsEntry = { nick: string; damage: number; healing: number };
/** Ajustes do caller para uma pessoa na divisão. `extra`: pessoa que não pingou mas entra na divisão. */
export type PersonOverride = { nick: string; repair?: number; manualPercent?: number | null; excluded?: boolean; extra?: boolean };
export type LootSession = {
  id: string; event_id: string; title: string; silver: number; status: "open" | "closed"; created_at: string;
  split: SplitConfig; people: PersonOverride[]; items: LootItem[]; dps: DpsEntry[];
};

/** Erro de "tabela não existe": a migração 0021 ainda não foi rodada no Supabase. */
export function isMissingLoot(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || (/loot_sessions|loot_items|dps_entries/i.test(text) && /(does not exist|schema cache|not found|could not find)/i.test(text));
}

const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Lê a configuração guardada no banco, aceitando campos faltando ou fora do esperado. */
export function normalizeConfig(json: unknown): SplitConfig {
  const raw = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const weightsRaw = (raw["roleWeights"] && typeof raw["roleWeights"] === "object" ? raw["roleWeights"] : {}) as Record<string, unknown>;
  const roleWeights: Record<string, number> = {};
  for (const [role, weight] of Object.entries(weightsRaw)) if (typeof weight === "number" && Number.isFinite(weight) && weight >= 0) roleWeights[role] = weight;
  return {
    method: raw["method"] === "weighted" ? "weighted" : "equal",
    guildPercent: Math.min(100, Math.max(0, num(raw["guildPercent"]))),
    fixedCut: Math.max(0, Math.floor(num(raw["fixedCut"]))),
    deductRepair: raw["deductRepair"] === true,
    roleWeights,
  };
}

export function normalizePeople(json: unknown): PersonOverride[] {
  if (!Array.isArray(json)) return [];
  const out: PersonOverride[] = [];
  for (const entry of json) {
    if (!entry || typeof entry !== "object") continue;
    const p = entry as Record<string, unknown>;
    const nick = typeof p["nick"] === "string" ? p["nick"].trim() : "";
    if (nick.length < 2 || nick.length > 32) continue;
    out.push({
      nick,
      ...(num(p["repair"]) > 0 ? { repair: Math.floor(num(p["repair"])) } : {}),
      ...(typeof p["manualPercent"] === "number" && Number.isFinite(p["manualPercent"]) ? { manualPercent: Math.min(100, Math.max(0, p["manualPercent"])) } : {}),
      ...(p["excluded"] === true ? { excluded: true } : {}),
      ...(p["extra"] === true ? { extra: true } : {}),
    });
  }
  return out;
}

/** Prata direta + valor de todos os itens (quantidade x valor de cada). */
export function lootTotal(session: Pick<LootSession, "silver" | "items">): number {
  return session.silver + session.items.reduce((sum, item) => sum + item.quantity * item.unit_value, 0);
}

type SessionRow = { id: string; event_id: string; title: string; silver: number; status: string; created_at: string; split_config: Json; people: Json; loot_items: LootItem[] | null; dps_entries: DpsEntry[] | null };

/** Sessões de loot do conteúdo. `null` quando a migração 0021 ainda não foi rodada. */
export async function fetchLootSessions(eventId: string): Promise<LootSession[] | null> {
  const { data, error } = await supabase.from("loot_sessions")
    .select("id,event_id,title,silver,status,created_at,split_config,people,loot_items(id,session_id,name,quantity,unit_value,looted_by),dps_entries(nick,damage,healing)")
    .eq("event_id", eventId).order("created_at");
  if (error) { if (isMissingLoot(error)) return null; throw error; }
  return ((data ?? []) as unknown as SessionRow[]).map((row) => ({
    id: row.id, event_id: row.event_id, title: row.title, silver: Number(row.silver), status: row.status === "closed" ? "closed" : "open", created_at: row.created_at,
    split: normalizeConfig(row.split_config), people: normalizePeople(row.people),
    items: (row.loot_items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity), unit_value: Number(i.unit_value) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    dps: (row.dps_entries ?? []).map((d) => ({ nick: d.nick, damage: Number(d.damage), healing: Number(d.healing) })),
  }));
}

export async function createLootSession(eventId: string, title: string) {
  const { error } = await supabase.from("loot_sessions").insert({ event_id: eventId, title: title.trim() || "Loot", split_config: DEFAULT_SPLIT as unknown as Json });
  if (error) throw error;
}

/** Resultado da divisão guardado ao fechar a sessão (quanto cada pessoa recebeu). */
export type SessionResult = { total: number; rows: { nick: string; total: number }[] };

export function normalizeResult(json: unknown): SessionResult | null {
  if (!json || typeof json !== "object") return null;
  const raw = json as { total?: unknown; rows?: unknown };
  if (!Array.isArray(raw.rows)) return null;
  const rows: SessionResult["rows"] = [];
  for (const r of raw.rows) {
    if (!r || typeof r !== "object") continue;
    const { nick, total } = r as { nick?: unknown; total?: unknown };
    if (typeof nick === "string" && nick.trim() && typeof total === "number" && Number.isFinite(total) && total >= 0) rows.push({ nick: nick.trim(), total: Math.floor(total) });
  }
  return { total: typeof raw.total === "number" && Number.isFinite(raw.total) ? Math.floor(raw.total) : rows.reduce((s, r) => s + r.total, 0), rows };
}

export type MyLootEntry = { sessionId: string; eventId: string; eventTitle: string; sessionTitle: string; at: string; mine: number };

/** Quanto este nick recebeu em cada sessão fechada (ignora maiúsculas e minúsculas). */
export function myShares(sessions: { id: string; event_id: string; title: string; created_at: string; result: unknown; events?: { title?: string } | null }[], nick: string): MyLootEntry[] {
  const key = nick.trim().toLowerCase();
  const out: MyLootEntry[] = [];
  for (const s of sessions) {
    const result = normalizeResult(s.result);
    const row = result?.rows.find((r) => r.nick.toLowerCase() === key);
    if (row) out.push({ sessionId: s.id, eventId: s.event_id, eventTitle: s.events?.title ?? "Conteúdo", sessionTitle: s.title, at: s.created_at, mine: row.total });
  }
  return out;
}

/** Histórico de loot do jogador. `null` quando a migração 0023 ainda não foi rodada. */
export async function fetchMyLoot(nick: string): Promise<MyLootEntry[] | null> {
  const { data, error } = await supabase.from("loot_sessions")
    .select("id,event_id,title,created_at,result,events(title)")
    .eq("status", "closed").not("result", "is", null).order("created_at", { ascending: false }).limit(200);
  if (error) { if (isMissingLoot(error) || /result/i.test(error.message)) return null; throw error; }
  return myShares((data ?? []) as unknown as Parameters<typeof myShares>[0], nick);
}

export type SessionPatch = { title?: string; silver?: number; split?: SplitConfig; people?: PersonOverride[]; status?: "open" | "closed"; result?: SessionResult | null };
export async function saveLootSession(id: string, patch: SessionPatch) {
  const update: { title?: string; silver?: number; split_config?: Json; people?: Json; status?: string; result?: Json | null } = {};
  if (patch.title !== undefined) update.title = patch.title.trim() || "Loot";
  if (patch.silver !== undefined) update.silver = Math.max(0, Math.floor(patch.silver));
  if (patch.split) update.split_config = patch.split as unknown as Json;
  if (patch.people) update.people = patch.people as unknown as Json;
  if (patch.status) update.status = patch.status;
  if (patch.result !== undefined) update.result = patch.result as unknown as Json | null;
  let { error } = await supabase.from("loot_sessions").update(update).eq("id", id);
  // Migração 0023 ainda não rodada: salva o resto sem o histórico.
  if (error && "result" in update && /result/i.test(error.message)) { delete update.result; ({ error } = await supabase.from("loot_sessions").update(update).eq("id", id)); }
  if (error) throw error;
}

export async function deleteLootSession(id: string) {
  const { error } = await supabase.from("loot_sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function addLootItems(sessionId: string, items: PastedItem[]) {
  if (items.length === 0) return;
  const { error } = await supabase.from("loot_items").insert(items.map((i) => ({ session_id: sessionId, name: i.name, quantity: i.quantity, unit_value: i.unit_value })));
  if (error) throw error;
}

/**
 * Importa o loot exportado pelo programa do Triky313. Itens importados antes (external_id "imp:...") são trocados pelos novos,
 * então dá para exportar de novo durante o conteúdo e importar outra vez sem duplicar. Itens digitados à mão ficam.
 */
export async function importLootItems(sessionId: string, items: { name: string; quantity: number; unit_value: number; looted_by: string | null; external_id: string }[]) {
  if (items.length === 0) return;
  const clear = await supabase.from("loot_items").delete().eq("session_id", sessionId).like("external_id", "imp:%");
  const rows = items.map((i) => ({ session_id: sessionId, name: i.name, quantity: i.quantity, unit_value: i.unit_value, looted_by: i.looted_by, external_id: i.external_id }));
  if (clear.error && /external_id/i.test(clear.error.message)) {
    // Migração 0022 ainda não rodada: sem como evitar duplicar, então só acrescenta.
    const { error } = await supabase.from("loot_items").insert(rows.map(({ external_id: _e, ...rest }) => rest));
    if (error) throw error;
    return;
  }
  if (clear.error) throw clear.error;
  const { error } = await supabase.from("loot_items").insert(rows);
  if (error) throw error;
}

export async function deleteLootItem(id: string) {
  const { error } = await supabase.from("loot_items").delete().eq("id", id);
  if (error) throw error;
}

export async function saveDps(sessionId: string, rows: DpsEntry[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("dps_entries").upsert(rows.map((r) => ({ session_id: sessionId, ...r })), { onConflict: "session_id,nick" });
  if (error) throw error;
}

export async function deleteDps(sessionId: string, nick: string) {
  const { error } = await supabase.from("dps_entries").delete().eq("session_id", sessionId).eq("nick", nick);
  if (error) throw error;
}
