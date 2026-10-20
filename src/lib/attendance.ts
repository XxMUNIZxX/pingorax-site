import { supabase } from "@/integrations/supabase/client";

export type AttendanceRow = { event_id: string; nick: string; present: boolean };
export type PlayerStats = { nick: string; signed: number; present: number; absent: number; rate: number | null };

/** Erro de "tabela não existe": a migração 0012 ainda não foi rodada no Supabase. */
export function isMissingAttendance(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || (/attendance/i.test(text) && /(does not exist|schema cache|not found)/i.test(text));
}

/** Presença marcada dos conteúdos. `null` quando a migração 0012 ainda não foi rodada. */
export async function fetchAttendance(eventIds: string[]): Promise<AttendanceRow[] | null> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase.from("attendance").select("event_id,nick,present").in("event_id", eventIds);
  if (error) { if (isMissingAttendance(error)) return null; throw error; }
  return (data ?? []) as AttendanceRow[];
}

export async function markAttendance(rows: AttendanceRow[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "event_id,nick" });
  if (error) throw error;
}

const key = (nick: string) => nick.trim().toLowerCase();

/**
 * Resumo por jogador: quantas vezes pingou nos conteúdos já realizados, quantas compareceu e quantas faltou.
 * A taxa só considera o que foi marcado (conteúdo sem marcação não conta como falta).
 */
export function summarizeAttendance(
  events: { id: string; starts_at: string; signups: { nick: string }[] }[],
  rows: AttendanceRow[],
  now = Date.now(),
): PlayerStats[] {
  const stats = new Map<string, PlayerStats>();
  const entry = (nick: string) => {
    const k = key(nick);
    let s = stats.get(k);
    if (!s) { s = { nick: nick.trim(), signed: 0, present: 0, absent: 0, rate: null }; stats.set(k, s); }
    return s;
  };
  const past = new Set(events.filter((e) => new Date(e.starts_at).getTime() <= now).map((e) => e.id));
  for (const e of events) if (past.has(e.id)) for (const s of e.signups) entry(s.nick).signed++;
  for (const r of rows) {
    if (!past.has(r.event_id)) continue;
    const s = entry(r.nick);
    if (r.present) s.present++; else s.absent++;
  }
  for (const s of stats.values()) s.rate = s.present + s.absent > 0 ? s.present / (s.present + s.absent) : null;
  return [...stats.values()].sort((a, b) => b.present - a.present || b.signed - a.signed || a.nick.localeCompare(b.nick, "pt-BR"));
}
