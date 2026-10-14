import { supabase } from "@/integrations/supabase/client";
import { resolveWeaponIcons } from "@/lib/weapon-icons";
import { catalogIconUrl } from "@/lib/weapon-catalog";
import { fetchBuildsByIds, type Build } from "@/lib/builds";

export const ALBION_WEAPONS = [
  "Espada", "Machado", "Maça", "Martelo", "Luvas de Guerra", "Lança", "Bastão (Quarterstaff)",
  "Adaga", "Arco", "Besta", "Cajado de Fogo", "Cajado de Gelo", "Cajado Arcano",
  "Cajado Sagrado", "Cajado da Natureza", "Cajado Amaldiçoado", "Cajado Metamorfo",
  "Escudo / Tank", "Arma de Suporte",
];

export type EventWeapon = { id: string; name: string; slots: number; position: number; icon_path: string | null; icon_code: string | null; icon_url?: string | null; build_id: string | null; build?: Build | null };
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

const SELECT = "id,created_by,title,description,starts_at,max_players,mode,caller_name,content_type,event_weapons(id,name,slots,position,icon_path,icon_code,build_id),signups(id,nick,weapon_id,created_at)";

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

export async function fetchEvents(): Promise<GameEvent[]> {
  const { data, error } = await supabase.from("events").select(SELECT).order("starts_at");
  if (error) throw error;
  return withIcons((data ?? []) as GameEvent[]);
}

export async function fetchManagedEvents(): Promise<GameEvent[]> {
  // The database derives accessible IDs from auth.uid(), never a caller-supplied owner.
  const { data: ids, error: accessError } = await supabase.rpc("managed_event_ids");
  if (accessError) throw accessError;
  if (!ids?.length) return [];
  const query = supabase.from("events").select(SELECT).in("id", ids.map(row => row.id)).order("starts_at");
  const { data, error } = await query;
  if (error) throw error;
  return withIcons((data ?? []) as GameEvent[]);
}

export async function fetchEvent(id: string): Promise<GameEvent | null> {
  const { data, error } = await supabase.from("events").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withIcons([data as GameEvent]))[0] ?? null;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
