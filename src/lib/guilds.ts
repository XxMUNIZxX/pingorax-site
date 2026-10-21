import { supabase } from "@/integrations/supabase/client";
import { fetchEventsByIds, isMissingPrivateColumn, type GameEvent } from "@/lib/events";

export type Guild = { id: string; slug: string; name: string; description: string | null; owner_id: string };
export const MAX_GUILDS_PER_USER = 3;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** "Guilda dos Pingoras!" -> "guilda-dos-pingoras" (3 a 30 letras, números e hífen). Vazio se não sobrar o mínimo. */
export function slugify(name: string): string {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
  return SLUG_PATTERN.test(slug) ? slug : "";
}

/** Erro de "tabela/coluna não existe": a migração 0013 ainda não foi rodada no Supabase. */
export function isMissingGuilds(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST205" || error.code === "PGRST204"
    || (/guild/i.test(text) && /(does not exist|schema cache|not found|could not find)/i.test(text));
}

const COLUMNS = "id,slug,name,description,owner_id";

export async function fetchGuildBySlug(slug: string): Promise<Guild | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const { data, error } = await supabase.from("guilds").select(COLUMNS).eq("slug", slug).maybeSingle();
  if (error) { if (isMissingGuilds(error)) return null; throw error; }
  return data as Guild | null;
}

/** Guildas do usuário. `null` quando a migração 0013 ainda não foi rodada. */
export async function fetchMyGuilds(userId: string): Promise<Guild[] | null> {
  const { data, error } = await supabase.from("guilds").select(COLUMNS).eq("owner_id", userId).order("created_at");
  if (error) { if (isMissingGuilds(error)) return null; throw error; }
  return (data ?? []) as Guild[];
}

/** Conteúdos da guilda: os de hoje em diante (com folga de 3 h) e os 5 mais recentes que já passaram. */
export async function fetchGuildEvents(guildId: string, now = Date.now()): Promise<{ upcoming: GameEvent[]; recent: GameEvent[] }> {
  const cutoff = new Date(now - 3 * 3600_000).toISOString();
  // Conteúdo privado (só com o link) não aparece na página da guilda. Sem a migração 0015, mostra tudo como antes.
  const ids = async (hidePrivate: boolean) => {
    const base = () => supabase.from("events").select("id").eq("guild_id", guildId);
    const next = base().gte("starts_at", cutoff).order("starts_at").limit(30);
    const past = base().lt("starts_at", cutoff).order("starts_at", { ascending: false }).limit(5);
    return Promise.all(hidePrivate ? [next.eq("is_private", false), past.eq("is_private", false)] : [next, past]);
  };
  let [next, past] = await ids(true);
  if (isMissingPrivateColumn(next.error) || isMissingPrivateColumn(past.error)) [next, past] = await ids(false);
  if (next.error) throw next.error;
  if (past.error) throw past.error;
  const [upcoming, recent] = await Promise.all([
    fetchEventsByIds((next.data ?? []).map((row) => row.id)),
    fetchEventsByIds((past.data ?? []).map((row) => row.id)),
  ]);
  return { upcoming, recent: recent.reverse() };
}

/** Guilda atual de um conteúdo (vazio se a coluna ainda não existe). */
export async function fetchEventGuildId(eventId: string): Promise<string | null> {
  const { data, error } = await supabase.from("events").select("guild_id").eq("id", eventId).maybeSingle();
  if (error) return null;
  return data?.guild_id ?? null;
}
