import { gameDate, type KillSummary, type PlayerEvent } from "@/lib/albion-types";

export type WeaponUse = { code: string; uses: number; kills: number; deaths: number };
export type Opponent = { guild: string; count: number };
export type PlayerStats = {
  kills: number; deaths: number;
  /** Kills por morte; `null` quando não há nenhuma das duas. Sem mortes, é igual ao número de kills. */
  kd: number | null;
  fameGained: number; fameLost: number; avgKillFame: number;
  soloKills: number; groupKills: number;
  weapons: WeaponUse[];
  /** Guildas que mais apareceram do outro lado (quem você matou ou quem te matou). */
  opponents: Opponent[];
  /** Atividade por hora do dia (0–23), no fuso informado. */
  hours: number[];
  bestKill: KillSummary | null;
  worstDeath: KillSummary | null;
  from: string | null; to: string | null;
};

const top = <T>(map: Map<string, T>, score: (value: T) => number, limit: number) =>
  [...map.entries()].sort((a, b) => score(b[1]) - score(a[1]) || a[0].localeCompare(b[0])).slice(0, limit);

/**
 * Resumo do jogador a partir das kills e mortes recentes dele. Puro (sem rede) para ser testado.
 * `tzOffsetMinutes`: diferença do fuso em relação ao UTC, no mesmo sinal de `Date.getTimezoneOffset()` invertido
 * (Brasil = -180).
 */
export function playerStats(events: PlayerEvent[], tzOffsetMinutes = 0): PlayerStats {
  const weapons = new Map<string, WeaponUse>();
  const opponents = new Map<string, number>();
  const hours = new Array<number>(24).fill(0);
  let kills = 0; let deaths = 0; let fameGained = 0; let fameLost = 0; let soloKills = 0;
  let bestKill: KillSummary | null = null; let worstDeath: KillSummary | null = null;
  let from: string | null = null; let to: string | null = null;

  for (const e of events) {
    const mine = e.kind === "kill" ? e.killer : e.victim;
    const other = e.kind === "kill" ? e.victim : e.killer;
    if (e.kind === "kill") {
      kills++; fameGained += e.fame;
      if (e.assists === 0) soloKills++;
      if (!bestKill || e.fame > bestKill.fame) bestKill = e;
    } else {
      deaths++; fameLost += e.fame;
      if (!worstDeath || e.fame > worstDeath.fame) worstDeath = e;
    }
    const code = mine.gear.weapon;
    if (code) {
      const use = weapons.get(code) ?? { code, uses: 0, kills: 0, deaths: 0 };
      use.uses++; if (e.kind === "kill") use.kills++; else use.deaths++;
      weapons.set(code, use);
    }
    const guild = other.guild.trim();
    if (guild) opponents.set(guild, (opponents.get(guild) ?? 0) + 1);
    const when = gameDate(e.time).getTime();
    if (Number.isFinite(when)) {
      const hour = new Date(when + tzOffsetMinutes * 60_000).getUTCHours();
      hours[hour] = (hours[hour] ?? 0) + 1;
      if (from === null || e.time < from) from = e.time;
      if (to === null || e.time > to) to = e.time;
    }
  }

  return {
    kills, deaths,
    kd: kills + deaths === 0 ? null : deaths === 0 ? kills : kills / deaths,
    fameGained, fameLost, avgKillFame: kills ? fameGained / kills : 0,
    soloKills, groupKills: kills - soloKills,
    weapons: top(weapons, (w) => w.uses, 5).map(([, w]) => w),
    opponents: top(opponents, (n) => n, 5).map(([guild, count]) => ({ guild, count })),
    hours, bestKill, worstDeath, from, to,
  };
}

/** Hora do dia (0–23) mais movimentada, ou `null` se não há dados. */
export function busiestHour(hours: number[]): number | null {
  let best = -1; let hour: number | null = null;
  hours.forEach((count, h) => { if (count > best && count > 0) { best = count; hour = h; } });
  return hour;
}
