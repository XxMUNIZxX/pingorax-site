import type { BattleDetail, BattleKills, BattleListItem, BattlePlayer, BattleKill, Gear, KillSide, Server } from "@/lib/albion-types";

// API pública do jogo (sem chave). Cada servidor do Albion tem o seu endereço.
const HOSTS: Record<Server, string> = {
  americas: "https://gameinfo.albiononline.com",
  europe: "https://gameinfo-ams.albiononline.com",
  asia: "https://gameinfo-sgp.albiononline.com",
};

const memory = new Map<string, { at: number; value: unknown }>();
/**
 * Busca na API do jogo com dois níveis de cache: memória do servidor (rápido) e cache da Cloudflare
 * (compartilhado entre todos os visitantes). Assim a API lenta do Albion é chamada poucas vezes.
 */
export async function api<T>(server: Server, path: string, ttlMs: number, timeoutMs = 0): Promise<T> {
  const url = `${HOSTS[server]}/api/gameinfo${path}`;
  const hit = memory.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  let value: T | undefined;
  if (edge) {
    try { const cached = await edge.match(url); if (cached) value = (await cached.json()) as T; } catch { /* sem cache */ }
  }
  if (value === undefined) {
    const response = await fetch(url, { headers: { Accept: "application/json" }, ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
    if (!response.ok) throw new Error(`Albion respondeu ${response.status}`);
    const text = await response.text();
    value = JSON.parse(text) as T;
    if (edge) {
      try { await edge.put(url, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${Math.max(1, Math.round(ttlMs / 1000))}` } })); } catch { /* sem cache */ }
    }
  }
  if (memory.size > 300) memory.clear();
  memory.set(url, { at: Date.now(), value });
  return value;
}

export type Dict = Record<string, unknown>;
export const obj = (value: unknown): Dict => (value && typeof value === "object" ? (value as Dict) : {});
export const str = (value: unknown) => (typeof value === "string" ? value : "");
export const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// ---- Lista de batalhas ----
export async function listBattles(server: Server, page: number, minPlayers: number, query: string): Promise<BattleListItem[]> {
  const offset = Math.max(0, Math.min(page, 20)) * 51;
  const raw = list(await api<unknown>(server, `/battles?offset=${offset}&limit=51&sort=recent`, 10_000));
  const q = query.trim().toLowerCase();
  const out: BattleListItem[] = [];
  for (const item of raw) {
    const b = obj(item);
    const players = Object.values(obj(b["players"])).map(obj);
    if (players.length < minPlayers) continue;
    const alliances = Object.values(obj(b["alliances"])).map(obj).sort((x, y) => num(y["kills"]) - num(x["kills"]) || num(y["killFame"]) - num(x["killFame"]));
    const guilds = Object.values(obj(b["guilds"])).map(obj).sort((x, y) => num(y["kills"]) - num(x["kills"]) || num(y["killFame"]) - num(x["killFame"]));
    const groups = (guilds.length ? guilds : alliances).map((g) => str(g["name"])).filter(Boolean);
    if (q) {
      const hay = [...groups, ...guilds.map((g) => str(g["name"])), ...players.map((p) => str(p["name"]))].join("\n").toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push({ id: num(b["id"]), startTime: str(b["startTime"]), players: players.length, kills: num(b["totalKills"]), fame: num(b["totalFame"]), groups: groups.slice(0, 12) });
  }
  return out;
}

// ---- Detalhe de uma batalha ----
const SLOTS = ["MainHand", "OffHand", "Head", "Armor", "Shoes", "Bag", "Cape", "Mount", "Potion", "Food"] as const;
const KEYS = { MainHand: "weapon", OffHand: "offhand", Head: "helmet", Armor: "armor", Shoes: "boots", Bag: "bag", Cape: "cape", Mount: "mount", Potion: "potion", Food: "food" } as const;

export function gearOf(equipment: unknown): Gear {
  const e = obj(equipment);
  const gear: Gear = {};
  for (const slot of SLOTS) {
    const type = str(obj(e[slot])["Type"]);
    if (type) gear[KEYS[slot]] = type;
  }
  return gear;
}

export function sideOf(raw: unknown): KillSide {
  const p = obj(raw);
  return {
    id: str(p["Id"]), guildId: str(p["GuildId"]), name: str(p["Name"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]), allianceTag: str(p["AllianceTag"]),
    ip: Math.round(num(p["AverageItemPower"])), gear: gearOf(p["Equipment"]),
  };
}

type Seen = { ip: number; gear: Gear };
const PAGE = 51;
// Cada página de kills é grande (equipamento de todos os participantes). Poucas páginas, poucas por vez,
// e cada uma é reduzida assim que chega, para não estourar a memória do Worker.
const MAX_PAGES = 6;
const PARALLEL_PAGES = 3;

/** Etapa 1 (rápida): só o placar e os jogadores. Equipamento e IP chegam na etapa 2. */
export async function getBattle(server: Server, id: number): Promise<BattleDetail> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Batalha inválida");
  const battle = obj(await api<unknown>(server, `/battles/${id}`, 120_000));
  const players: BattlePlayer[] = Object.values(obj(battle["players"])).map(obj).map((p) => ({
    name: str(p["name"]), guild: str(p["guildName"]), alliance: str(p["allianceName"]),
    kills: num(p["kills"]), deaths: num(p["deaths"]), fame: num(p["killFame"]), ip: 0, gear: {},
  }));
  const alliances = Object.values(obj(battle["alliances"])).map(obj).map((a) => ({
    name: str(a["name"]), players: players.filter((p) => p.alliance && p.alliance === str(a["name"])).length,
    kills: num(a["kills"]), deaths: num(a["deaths"]), ip: 0, fame: num(a["killFame"]),
  })).sort((a, b) => b.fame - a.fame);
  const guilds = Object.values(obj(battle["guilds"])).map(obj).map((g) => ({
    name: str(g["name"]), alliance: str(g["alliance"]), players: players.filter((p) => p.guild && p.guild === str(g["name"])).length,
    kills: num(g["kills"]), deaths: num(g["deaths"]), ip: 0, fame: num(g["killFame"]),
  })).sort((a, b) => b.fame - a.fame);
  return {
    id, server, startTime: str(battle["startTime"]), endTime: str(battle["endTime"]),
    totalKills: num(battle["totalKills"]), totalFame: num(battle["totalFame"]), players, alliances, guilds, kills: [], killsShown: 0,
  };
}

type Reduced = { kill: BattleKill; sides: KillSide[] };
const reduceEvent = (raw: unknown): Reduced => {
  const e = obj(raw);
  const sides = [e["Killer"], e["Victim"], ...list(e["Participants"]), ...list(e["GroupMembers"])].map(sideOf);
  return { kill: { id: num(e["EventId"]), time: str(e["TimeStamp"]), fame: num(e["TotalVictimKillFame"]), killer: sides[0]!, victim: sides[1]! }, sides };
};

/** Etapa 2: kills da batalha (só as páginas que existem) e o equipamento/IP visto de cada jogador. */
export async function getBattleKills(server: Server, id: number, totalKills: number): Promise<BattleKills> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Batalha inválida");
  const cacheKey = `kills:${server}:${id}:${totalKills}`;
  const hit = memory.get(cacheKey);
  if (hit && Date.now() - hit.at < 300_000) return hit.value as BattleKills;

  const pageCount = Math.min(MAX_PAGES, Math.max(1, Math.ceil(totalKills / PAGE)));
  const reduced: Reduced[] = [];
  let failed = 0;
  for (let first = 0; first < pageCount; first += PARALLEL_PAGES) {
    const batch = Array.from({ length: Math.min(PARALLEL_PAGES, pageCount - first) }, (_, i) => first + i);
    const results = await Promise.all(batch.map(async (index) => {
      try {
        const response = await fetch(`${HOSTS[server]}/api/gameinfo/events/battle/${id}?offset=${index * PAGE}&limit=${PAGE}`, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Albion respondeu ${response.status}`);
        return list(await response.json()).map(reduceEvent);
      } catch (error) { console.error("[albion] events", id, index, error); failed++; return [] as Reduced[]; }
    }));
    for (const page of results) reduced.push(...page);
  }
  if (failed === pageCount) throw new Error("Albion não devolveu as kills");

  const seen = new Map<string, Seen>();
  for (const { sides } of reduced) {
    for (const s of sides) {
      if (!s.name || !s.ip) continue;
      if (!seen.has(s.name) || Object.keys(s.gear).length > Object.keys(seen.get(s.name)!.gear).length) seen.set(s.name, { ip: s.ip, gear: s.gear });
    }
  }
  const kills = reduced.map((r) => r.kill).sort((a, b) => a.time.localeCompare(b.time));
  const value: BattleKills = { kills, seen: Object.fromEntries(seen), truncated: totalKills > kills.length };
  if (memory.size > 300) memory.clear();
  memory.set(cacheKey, { at: Date.now(), value });
  return value;
}
