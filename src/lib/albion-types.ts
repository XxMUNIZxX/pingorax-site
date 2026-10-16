export type Server = "americas" | "europe" | "asia";
export const SERVERS: { value: Server; label: string }[] = [
  { value: "americas", label: "Américas" },
  { value: "europe", label: "Europa" },
  { value: "asia", label: "Ásia" },
];

/** Equipamento por casinha (mesmas chaves das builds, mais a bolsa). */
export type Gear = Partial<Record<"weapon" | "offhand" | "helmet" | "armor" | "boots" | "bag" | "cape" | "mount" | "potion" | "food", string>>;

export type BattleListItem = { id: number; startTime: string; players: number; kills: number; fame: number; groups: string[] };

export type KillSide = { id?: string; name: string; guild: string; alliance: string; allianceTag: string; ip: number; gear: Gear };
export type BattleKill = { id: number; time: string; fame: number; killer: KillSide; victim: KillSide };

export type BattlePlayer = { name: string; guild: string; alliance: string; kills: number; deaths: number; fame: number; ip: number; gear: Gear };
export type BattleGroup = { name: string; alliance?: string; players: number; kills: number; deaths: number; ip: number; fame: number };

export type BattleDetail = {
  id: number; server: Server; startTime: string; endTime: string; totalKills: number; totalFame: number;
  players: BattlePlayer[]; alliances: BattleGroup[]; guilds: BattleGroup[]; kills: BattleKill[]; killsShown: number;
};

export type BattleKills = { kills: BattleKill[]; seen: Record<string, { ip: number; gear: Gear }>; truncated: boolean };

// ---- Kills (killboard) ----
export type KillSummary = { id: number; time: string; fame: number; killer: KillSide; victim: KillSide; assists: number; battleId: number };
export type KillParticipant = { name: string; id: string; guild: string; alliance: string; ip: number; gear: Gear; damage: number; heal: number };
export type KillDetail = KillSummary & { inventory: { type: string; count: number }[]; participants: KillParticipant[]; location: string };
export type PlayerHit = { id: string; name: string; guild: string; alliance: string; killFame: number };
export type PlayerEvent = KillSummary & { kind: "kill" | "death" };
export type PlayerProfile = { id: string; name: string; guild: string; alliance: string; killFame: number; deathFame: number; fameRatio: number; events: PlayerEvent[] };

/** "há 5 h", "há 12 min"... */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - gameDate(iso).getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return `há ${Math.round(minutes / 1440)} d`;
}

/** "1.4M", "339.6k"... */
export function shortNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(value));
}

/** Fama na lista de batalhas: "98K", "1.0M". */
export function fameShort(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

/** Datas do jogo vêm com 7-9 casas decimais; alguns navegadores não leem isso. */
export function gameDate(value: string) {
  return new Date(value.replace(/(\.\d{3})\d*/, "$1"));
}
