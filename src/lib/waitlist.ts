import { supabase } from "@/integrations/supabase/client";

export type WaitlistEntry = { id: string; event_id: string; weapon_id: string; nick: string; created_at: string };

/** Erro de "tabela não existe": a migração 0011 ainda não foi rodada no Supabase. */
export function isMissingWaitlist(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /waitlist/i.test(error.message ?? "") && /(does not exist|schema cache|not found)/i.test(error.message ?? "");
}

/** Fila de espera de um conteúdo, da mais antiga para a mais nova. `null` quando a migração ainda não foi rodada. */
export async function fetchWaitlist(eventId: string): Promise<WaitlistEntry[] | null> {
  const { data, error } = await supabase.from("waitlist").select("id,event_id,weapon_id,nick,created_at").eq("event_id", eventId).order("created_at");
  if (error) { if (isMissingWaitlist(error)) return null; throw error; }
  return (data ?? []) as WaitlistEntry[];
}

/** Fila de vários conteúdos de uma vez (painel de criação). */
export async function fetchWaitlists(eventIds: string[]): Promise<Map<string, WaitlistEntry[]> | null> {
  const map = new Map<string, WaitlistEntry[]>();
  if (eventIds.length === 0) return map;
  const { data, error } = await supabase.from("waitlist").select("id,event_id,weapon_id,nick,created_at").in("event_id", eventIds).order("created_at");
  if (error) { if (isMissingWaitlist(error)) return null; throw error; }
  for (const row of (data ?? []) as WaitlistEntry[]) map.set(row.event_id, [...(map.get(row.event_id) ?? []), row]);
  return map;
}
