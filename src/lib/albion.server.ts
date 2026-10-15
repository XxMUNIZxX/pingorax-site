import type { BattleDetail, BattleListItem, BattlePlayer, BattleKill, Gear, KillSide, Server } from "@/lib/albion-types";

// API pública do jogo (sem chave). Cada servidor do Albion tem o seu endereço.
const HOSTS: Record<Server, string> = {
  americas: "https://gameinfo.albiononline.com",
  europe: "https://gameinfo-ams.albiononline.com",
  asia: "https://gameinfo-sgp.albiononline.com",
};

const memory = new Map<string, { at: number; value: unknown }>();
async function api<T>(server: Server, path: string, ttlMs: number): Promise<T> {
  const key = `${server}${path}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const response = await fetch(`${HOSTS[server]}/api/gameinfo${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Albion respondeu ${response.status}`);
  const value = (await response.json()) as T;
  if (memory.size > 300) memory.clear();
  memory.set(key, { at: Date.now(), value });
  return value;
}

type Dict = Record<string, unknown>;
const obj = (value: unknown): Dict => (value && typeof value === "object" ? (value as Dict) : {});
const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

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
    const groups = (alliances.length ? alliances : guilds).map((g) => str(g["name"])).filter(Boolean);
    if (q) {
      const hay = [...groups, ...guilds.map((g) => str(g["name"])), ...players.map((p) => str(p["name"]))].join("\n").toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push({ id: num(b["id"]), startTime: str(b["startTime"]), players: players.length, kills: num(b["totalKills"]), fame: num(b["totalFame"]), groups: groups.slice(0, 6) });
  }
  return out;
}

// ---- Detalhe de uma batalha ----
const SLOTS = ["MainHand", "OffHand", "Head", "Armor", "Shoes", "Bag", "Cape", "Mount", "Potion", "Food"] as const;
const KEYS = { MainHand: "weapon", OffHand: "offhand", Head: "helmet", Armor: "armor", Shoes: "boots", Bag: "bag", Cape: "cape", Mount: "mount", Potion: "potion", Food: "food" } as const;

function gearOf(equipment: unknown): Gear {
  const e = obj(equipment);
  const gear: Gear = {};
  for (const slot of SLOTS) {
    const type = str(obj(e[slot])["Type"]);
    if (type) gear[KEYS[slot]] = type;
  }
  return gear;
}

function sideOf(raw: unknown): KillSide {
  const p = obj(raw);
  return {
    name: str(p["Name"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]), allianceTag: str(p["AllianceTag"]),
    ip: Math.round(num(p["AverageItemPower"])), gear: gearOf(p["Equipment"]),
  };
}

type Seen = { ip: number; gear: Gear };

export async function getBattle(server: Server, id: number): Promise<BattleDetail> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Batalha inválida");
  const battle = obj(await api<unknown>(server, `/battles/${id}`, 120_000));
  // Até 6 páginas de kills (51 por vez) em paralelo: o suficiente para a maioria das lutas.
  const pages = await Promise.all([0, 1, 2, 3, 4, 5].map((i) =>
    api<unknown>(server, `/events/battle/${id}?offset=${i * 51}&limit=51`, 60_000).then(list).catch(() => [] as unknown[])));
  const events = pages.flat().map(obj);
  const totalKills = num(battle["totalKills"]);

  const seen = new Map<string, Seen>();
  const remember = (raw: unknown) => {
    const s = sideOf(raw);
    if (!s.name || !s.ip) return;
    if (!seen.has(s.name) || Object.keys(s.gear).length > Object.keys(seen.get(s.name)!.gear).length) seen.set(s.name, { ip: s.ip, gear: s.gear });
  };

  const kills: BattleKill[] = events.map((e) => {
    remember(e["Killer"]); remember(e["Victim"]);
    for (const member of list(e["Participants"])) remember(member);
    for (const member of list(e["GroupMembers"])) remember(member);
    return { id: num(e["EventId"]), time: str(e["TimeStamp"]), fame: num(e["TotalVictimKillFame"]), killer: sideOf(e["Killer"]), victim: sideOf(e["Victim"]) };
  }).sort((a, b) => a.time.localeCompare(b.time));

  const players: BattlePlayer[] = Object.values(obj(battle["players"])).map(obj).map((p) => {
    const name = str(p["name"]);
    const info = seen.get(name);
    return {
      name, guild: str(p["guildName"]), alliance: str(p["allianceName"]),
      kills: num(p["kills"]), deaths: num(p["deaths"]), fame: num(p["killFame"]), ip: info?.ip ?? 0, gear: info?.gear ?? {},
    };
  });

  const ipOf = (rows: BattlePlayer[]) => {
    const known = rows.filter((p) => p.ip > 0);
    return known.length ? Math.round(known.reduce((sum, p) => sum + p.ip, 0) / known.length) : 0;
  };
  const alliances = Object.values(obj(battle["alliances"])).map(obj).map((a) => {
    const rows = players.filter((p) => p.alliance && p.alliance === str(a["name"]));
    return { name: str(a["name"]), players: rows.length, kills: num(a["kills"]), deaths: num(a["deaths"]), ip: ipOf(rows), fame: num(a["killFame"]) };
  }).sort((a, b) => b.fame - a.fame);
  const guilds = Object.values(obj(battle["guilds"])).map(obj).map((g) => {
    const rows = players.filter((p) => p.guild && p.guild === str(g["name"]));
    return { name: str(g["name"]), alliance: str(g["alliance"]), players: rows.length, kills: num(g["kills"]), deaths: num(g["deaths"]), ip: ipOf(rows), fame: num(g["killFame"]) };
  }).sort((a, b) => b.fame - a.fame);

  return {
    id, server, startTime: str(battle["startTime"]), endTime: str(battle["endTime"]),
    totalKills, totalFame: num(battle["totalFame"]), players, alliances, guilds, kills,
    killsShown: kills.length,
  };
}
