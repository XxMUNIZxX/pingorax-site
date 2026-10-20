export const WEAPON_ROLES = [
  { id: "tank", label: "Tank", className: "border-sky-400/50 bg-sky-400/10 text-sky-300" },
  { id: "offtank", label: "Off-Tank", className: "border-indigo-400/50 bg-indigo-400/10 text-indigo-300" },
  { id: "healer", label: "Healer", className: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" },
  { id: "support", label: "Support", className: "border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300" },
  { id: "dps_melee", label: "DPS Melee", className: "border-red-400/50 bg-red-400/10 text-red-300" },
  { id: "dps_ranged", label: "DPS Ranged", className: "border-amber-400/50 bg-amber-400/10 text-amber-300" },
] as const;

export type WeaponRole = (typeof WEAPON_ROLES)[number]["id"];

export function roleInfo(role: string | null | undefined) {
  return WEAPON_ROLES.find((r) => r.id === role) ?? null;
}

export function roleLabel(role: string | null | undefined): string | null {
  return roleInfo(role)?.label ?? null;
}

/** True quando o erro do banco é só porque a coluna `role` ainda não existe (migração 0009 não rodada). */
export function isMissingRoleColumn(error: { message?: string | undefined; code?: string | undefined } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return /\brole\b/.test(msg) && (error.code === "42703" || error.code === "PGRST204" || msg.includes("column") || msg.includes("schema cache"));
}

/** Move o item de `from` uma posição para cima (-1) ou para baixo (+1), sem mexer no array original. */
export function moveItem<T>(list: readonly T[], from: number, delta: -1 | 1): T[] {
  const to = from + delta;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
