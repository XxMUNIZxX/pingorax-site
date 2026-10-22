import { supabase } from "@/integrations/supabase/client";
import { fetchEventsByIds, type GameEvent } from "@/lib/events";
import { fetchAttendance, type AttendanceRow } from "@/lib/attendance";

export type MyPing = {
  id: string; title: string; starts_at: string;
  status: "confirmed" | "waitlist"; weapon: string | null;
  attendance: "present" | "absent" | null;
};
export type MyPings = { upcoming: MyPing[]; past: MyPing[]; present: number; absent: number; rate: number | null };
type Row = { event_id: string; weapon_id: string };

const ONGOING_MS = 3 * 3600_000;

/** Deixa o nick seguro para `ilike` (sem coringas): vira uma comparação sem diferenciar maiúsculas. */
export function escapeLike(nick: string): string {
  return nick.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Junta os pings da pessoa com os conteúdos: o que vem aí (inclui o que começou há até 3 h) e o que já passou,
 * com a presença marcada pelo caller. Quem está confirmado e na fila do mesmo conteúdo conta como confirmado.
 */
export function buildMyPings(events: GameEvent[], signups: Row[], waitlist: Row[], attendance: AttendanceRow[] | null, nick: string, now = Date.now()): MyPings {
  const mine = nick.trim().toLowerCase();
  const marks = new Map<string, boolean>();
  for (const a of attendance ?? []) if (a.nick.trim().toLowerCase() === mine) marks.set(a.event_id, a.present);
  const signed = new Map(signups.map((r) => [r.event_id, r.weapon_id]));
  const queued = new Map(waitlist.map((r) => [r.event_id, r.weapon_id]));

  const all: MyPing[] = [];
  for (const e of events) {
    const confirmed = signed.has(e.id);
    if (!confirmed && !queued.has(e.id)) continue;
    const weaponId = signed.get(e.id) ?? queued.get(e.id);
    const present = marks.get(e.id);
    all.push({
      id: e.id, title: e.title, starts_at: e.starts_at, status: confirmed ? "confirmed" : "waitlist",
      weapon: e.event_weapons.find((w) => w.id === weaponId)?.name ?? null,
      attendance: present === undefined ? null : present ? "present" : "absent",
    });
  }
  const t = (p: MyPing) => new Date(p.starts_at).getTime();
  const upcoming = all.filter((p) => t(p) > now - ONGOING_MS).sort((a, b) => t(a) - t(b));
  const past = all.filter((p) => t(p) <= now - ONGOING_MS).sort((a, b) => t(b) - t(a)).slice(0, 10);
  const present = all.filter((p) => p.attendance === "present").length;
  const absent = all.filter((p) => p.attendance === "absent").length;
  return { upcoming, past, present, absent, rate: present + absent > 0 ? present / (present + absent) : null };
}

/** Os pings da pessoa pelo nick do perfil, incluindo conteúdos privados em que ela entrou pelo link. */
export async function fetchMyPings(nick: string): Promise<MyPings> {
  const pattern = escapeLike(nick);
  const [s, w] = await Promise.all([
    supabase.from("signups").select("event_id,weapon_id").ilike("nick", pattern),
    supabase.from("waitlist").select("event_id,weapon_id").ilike("nick", pattern),
  ]);
  if (s.error) throw s.error;
  const signups = (s.data ?? []) as Row[];
  const waitlist = w.error ? [] : ((w.data ?? []) as Row[]); // sem a migração da fila, só não mostra a fila
  const ids = [...new Set([...signups, ...waitlist].map((r) => r.event_id))];
  const events = await fetchEventsByIds(ids);
  const attendance = await fetchAttendance(ids).catch(() => null);
  return buildMyPings(events, signups, waitlist, attendance, nick);
}
