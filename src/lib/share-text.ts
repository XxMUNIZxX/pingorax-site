import { roleLabel } from "@/lib/weapon-roles";

type ShareEvent = {
  id: string; title: string; starts_at: string; max_players: number; mode: string | null; caller_name: string | null; content_type: string | null;
  event_weapons: { name: string; slots: number; position: number; role?: string | null | undefined }[];
  signups: unknown[];
};

/**
 * Texto pronto para colar no Discord/WhatsApp. O horário usa o formato de data do Discord (<t:...>), que cada pessoa
 * vê no próprio fuso; fora do Discord ele aparece como texto, por isso a data por extenso vai junto.
 */
export function eventInviteText(event: ShareEvent, origin: string, whenText: string): string {
  const unix = Math.floor(new Date(event.starts_at).getTime() / 1000);
  const info = [event.mode, event.content_type].filter(Boolean).join(" • ");
  const weapons = [...event.event_weapons].sort((a, b) => a.position - b.position)
    .map((w) => `• ${w.name}${roleLabel(w.role) ? ` (${roleLabel(w.role)})` : ""} — ${w.slots} ${w.slots === 1 ? "vaga" : "vagas"}`);
  return [
    `**${event.title}**${info ? ` — ${info}` : ""}`,
    `🕒 <t:${unix}:F> (${whenText})`,
    ...(event.caller_name ? [`🎙️ Caller: ${event.caller_name}`] : []),
    `👥 ${event.signups.length}/${event.max_players} jogadores`,
    ...(weapons.length ? ["", ...weapons] : []),
    "",
    `Pingue aqui: ${origin.replace(/\/+$/, "")}/evento/${event.id}`,
  ].join("\n");
}

/** Link direto para abrir uma build na página de builds. */
export const buildLink = (origin: string, id: string) => `${origin.replace(/\/+$/, "")}/builds?build=${id}`;

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
