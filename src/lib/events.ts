import { supabase } from "@/integrations/supabase/client";
import { linkClient } from "@/lib/event-link";
import { resolveWeaponIcons } from "@/lib/weapon-icons";
import { catalogIconUrl } from "@/lib/weapon-catalog";
import { fetchBuildsByIds, type Build } from "@/lib/builds";
import { isMissingRoleColumn } from "@/lib/weapon-roles";

export const ALBION_WEAPONS = [
  "Espada", "Machado", "Maça", "Martelo", "Luvas de Guerra", "Lança", "Bastão (Quarterstaff)",
  "Adaga", "Arco", "Besta", "Cajado de Fogo", "Cajado de Gelo", "Cajado Arcano",
  "Cajado Sagrado", "Cajado da Natureza", "Cajado Amaldiçoado", "Cajado Metamorfo",
  "Escudo / Tank", "Arma de Suporte",
];

export type EventWeapon = { id: string; name: string; slots: number; position: number; icon_path: string | null; icon_code: string | null; icon_url?: string | null; build_id: string | null; role?: string | null; build?: Build | null };
export type Signup = { id: string; nick: string; weapon_id: string; created_at: string };
export type GameEvent = {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  starts_at: string;
  max_players: number; mode: string | null; caller_name: string | null; content_type: string | null;
  event_weapons: EventWeapon[];
  signups: Signup[];
};

const SELECT_BASE = (weaponCols: string) => `id,created_by,title,description,starts_at,max_players,mode,caller_name,content_type,event_weapons(${weaponCols}),signups(id,nick,weapon_id,created_at)`;
const WEAPON_COLS = "id,name,slots,position,icon_path,icon_code,build_id";
const SELECT = SELECT_BASE(`${WEAPON_COLS},role`);
/** Consulta sem a coluna `role`, usada se a migração 0009 ainda não foi rodada no banco. */
const SELECT_LEGACY = SELECT_BASE(WEAPON_COLS);

/** Roda a consulta com `role`; se a coluna ainda não existe, repete sem ela para o site não quebrar. */
async function withRoleFallback<T>(run: (select: string) => PromiseLike<{ data: T; error: { message?: string; code?: string } | null }>) {
  const first = await run(SELECT);
  if (!isMissingRoleColumn(first.error)) return first;
  return run(SELECT_LEGACY);
}

async function withIcons(events: GameEvent[]) {
  const buildIds = [...new Set(events.flatMap((event) => event.event_weapons.flatMap((weapon) => weapon.build_id ? [weapon.build_id] : [])))];
  const [urls, builds] = await Promise.all([
    resolveWeaponIcons(events.flatMap((event) => event.event_weapons.flatMap((weapon) => weapon.icon_path ? [weapon.icon_path] : []))),
    // Se as builds não carregarem, o conteúdo continua aparecendo normalmente.
    fetchBuildsByIds(buildIds).catch(() => [] as Build[]),
  ]);
  const byId = new Map(builds.map((build) => [build.id, build]));
  return events.map((event) => ({ ...event, event_weapons: event.event_weapons.map((weapon) => ({
    ...weapon,
    icon_url: (weapon.icon_path ? urls.get(weapon.icon_path) : undefined) ?? (weapon.icon_code ? catalogIconUrl(weapon.icon_code) : null),
    build: weapon.build_id ? byId.get(weapon.build_id) ?? null : null,
  })) }));
}

/** Erro de "coluna não existe": a migração 0015 (conteúdo privado) ainda não foi rodada no Supabase. */
export function isMissingPrivateColumn(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "42703" || error.code === "PGRST204" || (/is_private/i.test(text) && /(does not exist|schema cache|not found|could not find)/i.test(text));
}

/** Lista pública: conteúdos privados (só com o link) ficam de fora. Sem a migração 0015, lista tudo como antes. */
export async function fetchEvents(): Promise<GameEvent[]> {
  const run = (hidePrivate: boolean) => withRoleFallback((select) => {
    const query = supabase.from("events").select(select).order("starts_at");
    return hidePrivate ? query.eq("is_private", false) : query;
  });
  let result = await run(true);
  if (isMissingPrivateColumn(result.error)) result = await run(false);
  if (result.error) throw result.error;
  return withIcons((result.data ?? []) as unknown as GameEvent[]);
}

/** A migração 0015 já foi rodada? (para mostrar ou esconder a opção "privado" no editor) */
export async function fetchPrivacySupport(): Promise<boolean> {
  const { error } = await supabase.from("events").select("is_private").limit(1);
  return !error;
}

/** O conteúdo é privado? Falso se a coluna ainda não existe. */
export async function fetchIsPrivate(id: string): Promise<boolean> {
  const { data, error } = await linkClient(id).from("events").select("is_private").eq("id", id).maybeSingle();
  return !error && !!data?.is_private;
}

/** Dos ids dados, os que são privados (para marcar no painel). */
export async function fetchPrivateIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.from("events").select("id").in("id", ids).eq("is_private", true);
  return new Set(error ? [] : (data ?? []).map((row) => row.id));
}

export async function fetchManagedEvents(): Promise<GameEvent[]> {
  // The database derives accessible IDs from auth.uid(), never a caller-supplied owner.
  const { data: ids, error: accessError } = await supabase.rpc("managed_event_ids");
  if (accessError) throw accessError;
  if (!ids?.length) return [];
  const { data, error } = await withRoleFallback((select) => supabase.from("events").select(select).in("id", ids.map(row => row.id)).order("starts_at"));
  if (error) throw error;
  return withIcons((data ?? []) as unknown as GameEvent[]);
}

/** Conteúdos pelos ids (ex.: os de uma guilda), do mais próximo para o mais distante. */
export async function fetchEventsByIds(ids: string[]): Promise<GameEvent[]> {
  if (ids.length === 0) return [];
  const { data, error } = await withRoleFallback((select) => supabase.from("events").select(select).in("id", ids).order("starts_at"));
  if (error) throw error;
  return withIcons((data ?? []) as unknown as GameEvent[]);
}

export async function fetchEvent(id: string): Promise<GameEvent | null> {
  // Com o cabeçalho do link, abre o conteúdo mesmo que seja privado.
  const { data, error } = await withRoleFallback((select) => linkClient(id).from("events").select(select).eq("id", id).maybeSingle());
  if (error) throw error;
  if (!data) return null;
  return (await withIcons([data as unknown as GameEvent]))[0] ?? null;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** Horários das repetições semanais: o mesmo dia da semana e hora, de 1 a `extra` semanas depois (no máximo 12). */
export function weeklyStarts(startIso: string, extra: number): string[] {
  const n = Math.min(Math.max(0, Math.floor(extra) || 0), 12);
  const start = new Date(startIso).getTime();
  return Array.from({ length: n }, (_, i) => new Date(start + (i + 1) * 7 * 24 * 3600 * 1000).toISOString());
}
