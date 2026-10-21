import type { GuildHit, GuildMember, GuildProfile, KillDetail, KillParticipant, KillSummary, PlayerEvent, PlayerHit, PlayerProfile, Server } from "@/lib/albion-types";
import { api, gearOf, list, num, obj, sideOf, str } from "@/lib/albion.server";

/** Kill reduzida: só o que a tela usa (a resposta do jogo traz inventário e participantes, muito pesados). */
function summaryOf(raw: unknown): KillSummary {
  const e = obj(raw);
  return {
    id: num(e["EventId"]), time: str(e["TimeStamp"]), fame: num(e["TotalVictimKillFame"]),
    killer: sideOf(e["Killer"]), victim: sideOf(e["Victim"]),
    assists: Math.max(0, num(e["numberOfParticipants"]) - 1), battleId: num(e["BattleId"]),
  };
}

/** Kills mais recentes do servidor. */
export async function recentKills(server: Server): Promise<KillSummary[]> {
  return list(await api<unknown>(server, "/events?limit=25&offset=0", 20_000)).map(summaryOf);
}

/** Busca jogadores e guildas pelo nome. */
export async function searchPlayers(server: Server, query: string): Promise<{ players: PlayerHit[]; guilds: GuildHit[] }> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { players: [], guilds: [] };
  // Alguns nomes o Albion demora mais para achar: espera até 20 s e tenta uma segunda vez antes de desistir.
  const path = `/search?q=${encodeURIComponent(q)}`;
  let raw: unknown;
  try { raw = await api<unknown>(server, path, 15 * 60_000, 20_000); }
  catch (first) { console.error("[albion] busca, tentando de novo", first); raw = await api<unknown>(server, path, 15 * 60_000, 20_000); }
  const result = obj(raw);
  const players = list(result["players"]).map(obj).slice(0, 12).map((p) => ({
    id: str(p["Id"]), name: str(p["Name"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]), killFame: num(p["KillFame"]),
  })).filter((p) => p.id && p.name);
  const guilds = list(result["guilds"]).map(obj).slice(0, 8).map((g) => ({
    id: str(g["Id"]), name: str(g["Name"]), alliance: str(g["AllianceName"]), killFame: num(g["KillFame"]), deathFame: num(g["DeathFame"]),
  })).filter((g) => g.id && g.name);
  return { players, guilds };
}

const ID = /^[A-Za-z0-9_-]{10,40}$/;

/** Perfil do jogador + últimas kills e mortes juntas. */
export async function playerProfile(server: Server, id: string): Promise<PlayerProfile> {
  if (!ID.test(id)) throw new Error("Jogador inválido");
  const [info, kills, deaths] = await Promise.all([
    api<unknown>(server, `/players/${id}`, 120_000),
    api<unknown>(server, `/players/${id}/kills?limit=50&offset=0`, 60_000).catch(() => []),
    api<unknown>(server, `/players/${id}/deaths?limit=50&offset=0`, 60_000).catch(() => []),
  ]);
  const p = obj(info);
  const events: PlayerEvent[] = [
    ...list(kills).map((e) => ({ ...summaryOf(e), kind: "kill" as const })),
    ...list(deaths).map((e) => ({ ...summaryOf(e), kind: "death" as const })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 100);
  return {
    id, guildId: str(p["GuildId"]), name: str(p["Name"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]),
    killFame: num(p["KillFame"]), deathFame: num(p["DeathFame"]), fameRatio: num(p["FameRatio"]), events,
  };
}

/** Uma kill completa: equipamento, inventário da vítima e participantes. */
export async function killDetail(server: Server, id: number): Promise<KillDetail> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Kill inválida");
  const e = obj(await api<unknown>(server, `/events/${id}`, 600_000, 10_000));
  const victim = obj(e["Victim"]);
  const inventory = list(victim["Inventory"]).map(obj).map((item) => ({ type: str(item["Type"]), count: Math.max(1, num(item["Count"])) })).filter((item) => item.type);
  const participants: KillParticipant[] = list(e["Participants"]).map(obj).map((p) => ({
    name: str(p["Name"]), id: str(p["Id"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]),
    ip: Math.round(num(p["AverageItemPower"])), gear: gearOf(p["Equipment"]), damage: Math.round(num(p["DamageDone"])), heal: Math.round(num(p["SupportHealingDone"])),
  })).sort((a, b) => b.damage + b.heal - (a.damage + a.heal));
  return { ...summaryOf(e), inventory, participants, location: str(e["KillArea"]) };
}

const GUILD_ID = /^[A-Za-z0-9_-]{10,40}$/;
/** A API do jogo mistura "killFame" e "KillFame" conforme o endereço: lê os dois. */
const pick = (o: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (o[key] !== undefined && o[key] !== null) return o[key]; return undefined; };

/** Guilda: números gerais e a lista de membros (os 100 com mais fama de kill). */
export async function guildProfile(server: Server, id: string): Promise<GuildProfile> {
  if (!GUILD_ID.test(id)) throw new Error("Guilda inválida");
  const [info, members] = await Promise.all([
    api<unknown>(server, `/guilds/${id}`, 10 * 60_000, 15_000),
    api<unknown>(server, `/guilds/${id}/members`, 10 * 60_000, 20_000).catch(() => []),
  ]);
  const g = obj(info);
  const rows: GuildMember[] = list(members).map(obj).map((m) => ({
    id: str(m["Id"]), name: str(m["Name"]), killFame: num(pick(m, "KillFame", "killFame")), deathFame: num(pick(m, "DeathFame", "deathFame")), fameRatio: num(pick(m, "FameRatio", "fameRatio")),
  })).filter((m) => m.id && m.name).sort((a, b) => b.killFame - a.killFame);
  return {
    id, name: str(pick(g, "Name", "name")), alliance: str(pick(g, "AllianceName", "allianceName")), allianceTag: str(pick(g, "AllianceTag", "allianceTag")),
    founder: str(pick(g, "FounderName", "founderName")), founded: str(pick(g, "Founded", "founded")),
    memberCount: num(pick(g, "MemberCount", "memberCount")) || rows.length,
    killFame: num(pick(g, "killFame", "KillFame")), deathFame: num(pick(g, "DeathFame", "deathFame")),
    attacksWon: num(pick(g, "AttacksWon", "attacksWon")), defensesWon: num(pick(g, "DefensesWon", "defensesWon")),
    members: rows.slice(0, 100),
  };
}
