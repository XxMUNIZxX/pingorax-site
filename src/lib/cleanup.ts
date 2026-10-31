import { supabase } from "@/integrations/supabase/client";

/**
 * Limpezas para reutilizar um conteúdo. Cada uma só apaga o que o banco deixa a pessoa apagar (o chat é de quem gerencia o conteúdo;
 * loot e dps são de quem edita). Devolve quantas linhas saíram; 0 pode ser "já estava vazio" ou "sem permissão".
 */
async function deleteWhere(table: "event_messages" | "loot_sessions", column: "event_id", value: string): Promise<number> {
  const { data, error } = await supabase.from(table).delete().eq(column, value).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Apaga todas as mensagens do chat do conteúdo. */
export const clearChat = (eventId: string) => deleteWhere("event_messages", "event_id", eventId);

/** Apaga todas as sessões de loot do conteúdo (itens e dps vão junto). */
export const clearLoot = (eventId: string) => deleteWhere("loot_sessions", "event_id", eventId);

/** Apaga só os itens de uma sessão (o dps e a divisão ficam). */
export async function clearSessionItems(sessionId: string): Promise<number> {
  const { data, error } = await supabase.from("loot_items").delete().eq("session_id", sessionId).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Apaga só o dps de uma sessão. */
export async function clearSessionDps(sessionId: string): Promise<number> {
  const { data, error } = await supabase.from("dps_entries").delete().eq("session_id", sessionId).select("nick");
  if (error) throw error;
  return data?.length ?? 0;
}

export type ReuseResult = { chat: number | null; loot: number | null; failed: string[] };

/** Deixa o conteúdo pronto para ser usado de novo: limpa o que foi pedido e conta o que deu certo. */
export async function resetForReuse(eventId: string, what: { chat: boolean; loot: boolean }): Promise<ReuseResult> {
  const out: ReuseResult = { chat: null, loot: null, failed: [] };
  if (what.chat) { try { out.chat = await clearChat(eventId); } catch { out.failed.push("chat"); } }
  if (what.loot) { try { out.loot = await clearLoot(eventId); } catch { out.failed.push("loot e dps"); } }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Frase curta para o aviso depois de limpar. */
export function reuseSummary(r: ReuseResult): string {
  const parts: string[] = [];
  if (r.chat !== null) parts.push(plural(r.chat, "mensagem", "mensagens"));
  if (r.loot !== null) parts.push(plural(r.loot, "sessão de loot", "sessões de loot"));
  const done = parts.length ? `Apaguei ${parts.join(" e ")}.` : "Nada para apagar.";
  return r.failed.length ? `${done} Não consegui limpar: ${r.failed.join(", ")}.` : done;
}
