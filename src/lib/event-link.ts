import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Cabeçalho que prova que a pessoa tem o link do conteúdo (veja a migração 0020). */
export const LINK_HEADER = "x-event-link";

const cache = new Map<string, SupabaseClient<Database>>();

/**
 * Cliente do Supabase que abre UM conteúdo, inclusive se for privado: manda o id dele no cabeçalho
 * `x-event-link`. Use só para ler dados daquele conteúdo (a página dele, a fila, o chat).
 * Não guarda login: quem gerencia o conteúdo continua usando o cliente normal nas telas de edição.
 */
export function linkClient(eventId: string): SupabaseClient<Database> {
  const hit = cache.get(eventId);
  if (hit) return hit;
  const url = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) || process.env["SUPABASE_URL"];
  const key = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) || process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Faltam SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { [LINK_HEADER]: eventId },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        // Chaves novas do Supabase (sb_publishable_...) não são JWT: não vão como Authorization.
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  if (cache.size > 50) cache.clear();
  cache.set(eventId, client);
  return client;
}
