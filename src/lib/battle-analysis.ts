import { gameDate, type BattleDetail, type BattleKill, type BattleKills, type BattlePlayer, type Gear } from "@/lib/albion-types";

export type Role = "DPS" | "Healer" | "Tank";
export const ROLES: Role[] = ["DPS", "Healer", "Tank"];
export const ROLE_COLOR: Record<Role, string> = { DPS: "#ef4444", Healer: "#22c55e", Tank: "#3b82f6" };

const HEAL = /(HOLYSTAFF|NATURESTAFF|DIVINESTAFF|WILDSTAFF|DRUIDSTAFF)/;
const TANK_WEAPON = /(HAMMER|MACE|FLAIL|MORNINGSTAR)/;

/** Função estimada pelo equipamento visto (o jogo não informa a função). */
export function roleOf(gear: Gear): Role | null {
  const weapon = gear.weapon ?? "";
  if (!weapon) return null;
  if (HEAL.test(weapon)) return "Healer";
  if (/SHIELD/.test(gear.offhand ?? "") || TANK_WEAPON.test(weapon)) return "Tank";
  return "DPS";
}

/** Aliança do jogador; quem não tem aliança conta pela guilda. */
export const groupOf = (p: { alliance: string; guild: string }) => p.alliance || p.guild || "(sem guilda)";

// ---- Linha do tempo ----
export type TimelineEvent = { t: number; v: number; kind: "kill" | "death"; kill: BattleKill };
export type Series = { name: string; points: { t: number; v: number }[]; events: TimelineEvent[]; end: number; total: number };
export type Timeline = { series: Series[]; duration: number; max: number; min: number };

export const SERIES_COLORS = ["#34d399", "#ef4444", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#2dd4bf", "#fb923c"];

/** Kills (ou kills - mortes) acumuladas por aliança/guilda ao longo da luta, com cada evento guardado. */
export function buildTimeline(battle: BattleDetail, by: "alliance" | "guild", mode: "kills" | "momentum"): Timeline {
  const label = (s: { alliance: string; guild: string }) => (by === "alliance" ? s.alliance || s.guild : s.guild || s.alliance) || "(desconhecido)";
  const kills = battle.kills;
  const start = kills.length ? gameDate(kills[0]!.time).getTime() : gameDate(battle.startTime).getTime();
  const end = kills.length ? gameDate(kills[kills.length - 1]!.time).getTime() : start;
  const duration = Math.max(1, (end - start) / 1000);

  const totals = new Map<string, number>();
  for (const k of kills) totals.set(label(k.killer), (totals.get(label(k.killer)) ?? 0) + 1);
  const names = [...new Set([...totals.keys(), ...kills.map((k) => label(k.victim))])];
  const rank = (n: string) => (totals.get(n) ?? 0);
  const top = names.sort((a, b) => rank(b) - rank(a)).slice(0, SERIES_COLORS.length);

  const series: Series[] = top.map((name) => ({ name, points: [{ t: 0, v: 0 }], events: [], end: 0, total: rank(name) }));
  const score = new Map<string, number>();
  const push = (name: string, t: number, delta: number, kind: "kill" | "death", kill: BattleKill) => {
    const target = series.find((s) => s.name === name);
    if (!target) return;
    const v = (score.get(name) ?? 0) + delta;
    score.set(name, v);
    target.points.push({ t, v });
    target.events.push({ t, v, kind, kill });
  };
  for (const k of kills) {
    const t = (gameDate(k.time).getTime() - start) / 1000;
    push(label(k.killer), t, 1, "kill", k);
    if (mode === "momentum") push(label(k.victim), t, -1, "death", k);
  }
  for (const s of series) { s.end = s.points[s.points.length - 1]!.v; s.points.push({ t: duration, v: s.end }); }
  const values = series.flatMap((s) => s.points.map((p) => p.v));
  return { series, duration, max: Math.max(1, ...values), min: Math.min(0, ...values) };
}

/** Valor da série num instante (último degrau até ali). */
export function valueAt(series: Series, t: number) {
  let value = 0;
  for (const p of series.points) { if (p.t <= t) value = p.v; else break; }
  return value;
}

// ---- IP por função ----
export type RoleIp = { group: string; players: number; ip: number; roles: Record<Role, { count: number; ip: number }> };

export function ipByRole(players: BattlePlayer[]): RoleIp[] {
  const groups = new Map<string, BattlePlayer[]>();
  for (const p of players) groups.set(groupOf(p), [...(groups.get(groupOf(p)) ?? []), p]);
  return [...groups.entries()].map(([group, rows]) => {
    const roles = { DPS: { count: 0, ip: 0 }, Healer: { count: 0, ip: 0 }, Tank: { count: 0, ip: 0 } } as RoleIp["roles"];
    const sums: Record<Role, number> = { DPS: 0, Healer: 0, Tank: 0 };
    for (const p of rows) {
      const role = roleOf(p.gear);
      if (!role || !p.ip) continue;
      roles[role].count++; sums[role] += p.ip;
    }
    for (const role of ROLES) roles[role].ip = roles[role].count ? Math.round(sums[role] / roles[role].count) : 0;
    const known = rows.filter((p) => p.ip > 0);
    return { group, players: rows.length, ip: known.length ? Math.round(known.reduce((a, p) => a + p.ip, 0) / known.length) : 0, roles };
  }).sort((a, b) => b.players - a.players);
}

export type { BattleKill };

/** Junta o placar (etapa 1) com as kills, equipamentos e IP (etapa 2). */
export function mergeKills(battle: BattleDetail, extra: BattleKills | undefined): BattleDetail {
  if (!extra) return battle;
  const players = battle.players.map((p) => { const seen = extra.seen[p.name]; return seen ? { ...p, ip: seen.ip, gear: seen.gear } : p; });
  const avg = (rows: BattlePlayer[]) => { const known = rows.filter((p) => p.ip > 0); return known.length ? Math.round(known.reduce((sum, p) => sum + p.ip, 0) / known.length) : 0; };
  return {
    ...battle, players, kills: extra.kills, killsShown: extra.kills.length,
    alliances: battle.alliances.map((a) => ({ ...a, ip: avg(players.filter((p) => p.alliance === a.name)) })),
    guilds: battle.guilds.map((g) => ({ ...g, ip: avg(players.filter((p) => p.guild === g.name)) })),
  };
}
