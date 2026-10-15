import { gameDate, type BattleDetail, type BattleKill, type BattlePlayer, type Gear } from "@/lib/albion-types";

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
export type Series = { name: string; points: { t: number; v: number }[]; end: number };
export type Timeline = { series: Series[]; duration: number; max: number; min: number };

export const SERIES_COLORS = ["#34d399", "#ef4444", "#f59e0b", "#60a5fa", "#a78bfa", "#f472b6"];

/** Kills (ou kills - mortes) acumuladas por aliança/guilda ao longo da luta. */
export function buildTimeline(battle: BattleDetail, by: "alliance" | "guild", mode: "kills" | "momentum"): Timeline {
  const label = (s: { alliance: string; guild: string }) => (by === "alliance" ? s.alliance || s.guild : s.guild || s.alliance) || "(desconhecido)";
  const events = battle.kills;
  const start = events.length ? gameDate(events[0]!.time).getTime() : gameDate(battle.startTime).getTime();
  const end = events.length ? gameDate(events[events.length - 1]!.time).getTime() : start;
  const duration = Math.max(1, (end - start) / 1000);

  const score = new Map<string, number>();
  const totals = new Map<string, number>();
  const steps: { name: string; t: number; delta: number }[] = [];
  for (const k of events) {
    const t = (gameDate(k.time).getTime() - start) / 1000;
    const killer = label(k.killer); const victim = label(k.victim);
    totals.set(killer, (totals.get(killer) ?? 0) + 1);
    steps.push({ name: killer, t, delta: 1 });
    if (mode === "momentum") { totals.set(victim, totals.get(victim) ?? 0); steps.push({ name: victim, t, delta: -1 }); }
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, SERIES_COLORS.length).map(([name]) => name);
  const series: Series[] = top.map((name) => ({ name, points: [{ t: 0, v: 0 }], end: 0 }));
  for (const step of steps) {
    const target = series.find((s) => s.name === step.name);
    if (!target) continue;
    const value = (score.get(step.name) ?? 0) + step.delta;
    score.set(step.name, value);
    target.points.push({ t: step.t, v: value });
  }
  for (const s of series) { s.end = s.points[s.points.length - 1]!.v; s.points.push({ t: duration, v: s.end }); }
  const values = series.flatMap((s) => s.points.map((p) => p.v));
  return { series, duration, max: Math.max(1, ...values), min: Math.min(0, ...values) };
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
