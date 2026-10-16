import type { KillDetail, KillParticipant, KillSummary, PlayerEvent, PlayerHit, PlayerProfile, Server } from "@/lib/albion-types";
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

/** Busca jogadores pelo nome. */
export async function searchPlayers(server: Server, query: string): Promise<PlayerHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const result = obj(await api<unknown>(server, `/search?q=${encodeURIComponent(q)}`, 60_000));
  return list(result["players"]).map(obj).slice(0, 12).map((p) => ({
    id: str(p["Id"]), name: str(p["Name"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]), killFame: num(p["KillFame"]),
  })).filter((p) => p.id && p.name);
}

const ID = /^[A-Za-z0-9_-]{10,40}$/;

/** Perfil do jogador + últimas kills e mortes juntas. */
export async function playerProfile(server: Server, id: string): Promise<PlayerProfile> {
  if (!ID.test(id)) throw new Error("Jogador inválido");
  const [info, kills, deaths] = await Promise.all([
    api<unknown>(server, `/players/${id}`, 120_000),
    api<unknown>(server, `/players/${id}/kills?limit=25&offset=0`, 60_000).catch(() => []),
    api<unknown>(server, `/players/${id}/deaths?limit=25&offset=0`, 60_000).catch(() => []),
  ]);
  const p = obj(info);
  const events: PlayerEvent[] = [
    ...list(kills).map((e) => ({ ...summaryOf(e), kind: "kill" as const })),
    ...list(deaths).map((e) => ({ ...summaryOf(e), kind: "death" as const })),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 40);
  return {
    id, name: str(p["Name"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]),
    killFame: num(p["KillFame"]), deathFame: num(p["DeathFame"]), fameRatio: num(p["FameRatio"]), events,
  };
}

/** Uma kill completa: equipamento, inventário da vítima e participantes. */
export async function killDetail(server: Server, id: number): Promise<KillDetail> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Kill inválida");
  const e = obj(await api<unknown>(server, `/events/${id}`, 600_000));
  const victim = obj(e["Victim"]);
  const inventory = list(victim["Inventory"]).map(obj).map((item) => ({ type: str(item["Type"]), count: Math.max(1, num(item["Count"])) })).filter((item) => item.type);
  const participants: KillParticipant[] = list(e["Participants"]).map(obj).map((p) => ({
    name: str(p["Name"]), id: str(p["Id"]), guild: str(p["GuildName"]), alliance: str(p["AllianceName"]),
    ip: Math.round(num(p["AverageItemPower"])), gear: gearOf(p["Equipment"]), damage: Math.round(num(p["DamageDone"])), heal: Math.round(num(p["SupportHealingDone"])),
  })).sort((a, b) => b.damage + b.heal - (a.damage + a.heal));
  return { ...summaryOf(e), inventory, participants, location: str(e["KillArea"]) };
}
