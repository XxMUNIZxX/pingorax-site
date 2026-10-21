import { supabase } from "@/integrations/supabase/client";

export type ChatMessage = { id: string; event_id: string; nick: string; body: string; created_at: string };
export const CHAT_MAX = 500;
const COLUMNS = "id,event_id,nick,body,created_at";

/** Erro de "tabela ou função não existe": a migração 0018 ainda não foi rodada. */
export function isMissingChat(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || (/event_messages|send_event_message/i.test(text) && /(does not exist|schema cache|not found)/i.test(text));
}

/** Tira espaços das pontas e junta quebras de linha repetidas; devolve null se não sobrar nada ou passar do limite. */
export function cleanMessage(raw: string): string | null {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length >= 1 && text.length <= CHAT_MAX ? text : null;
}

/** Junta a lista atual com mensagens novas, sem repetir ids, em ordem de envio e limitada às mais recentes. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[], limit = 200): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of [...current, ...incoming]) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1)).slice(-limit);
}

/** Últimas mensagens do conteúdo. `null` quando o chat ainda não foi instalado no Supabase. */
export async function fetchChat(eventId: string): Promise<ChatMessage[] | null> {
  const { data, error } = await supabase.from("event_messages").select(COLUMNS).eq("event_id", eventId).order("created_at", { ascending: false }).limit(200);
  if (error) { if (isMissingChat(error)) return null; throw error; }
  return mergeMessages([], (data ?? []) as ChatMessage[]);
}

export async function sendChat(eventId: string, nick: string, body: string): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc("send_event_message", { _event_id: eventId, _nick: nick, _body: body });
  if (error) throw error;
  return data as unknown as ChatMessage;
}
