export type Server = "americas" | "europe" | "asia";
export const SERVERS: { value: Server; label: string }[] = [
  { value: "americas", label: "Américas" },
  { value: "europe", label: "Europa" },
  { value: "asia", label: "Ásia" },
];

/** Equipamento por casinha (mesmas chaves das builds, mais a bolsa). */
export type Gear = Partial<Record<"weapon" | "offhand" | "helmet" | "armor" | "boots" | "bag" | "cape" | "mount" | "potion" | "food", string>>;

export type BattleListItem = { id: number; startTime: string; players: number; kills: number; fame: number; groups: string[] };

export type KillSide = { name: string; guild: string; alliance: string; allianceTag: string; ip: number; gear: Gear };
export type BattleKill = { id: number; time: string; fame: number; killer: KillSide; victim: KillSide };

export type BattlePlayer = { name: string; guild: string; alliance: string; kills: number; deaths: number; fame: number; ip: number; gear: Gear };
export type BattleGroup = { name: string; alliance?: string; players: number; kills: number; deaths: number; ip: number; fame: number };

export type BattleDetail = {
  id: number; server: Server; startTime: string; endTime: string; totalKills: number; totalFame: number;
  players: BattlePlayer[]; alliances: BattleGroup[]; guilds: BattleGroup[]; kills: BattleKill[]; killsShown: number;
};

export type BattleKills = { kills: BattleKill[]; seen: Record<string, { ip: number; gear: Gear }>; truncated: boolean };

/** "1.4M", "339.6k"... */
export function shortNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(value));
}

/** Datas do jogo vêm com 7-9 casas decimais; alguns navegadores não leem isso. */
export function gameDate(value: string) {
  return new Date(value.replace(/(\.\d{3})\d*/, "$1"));
}
