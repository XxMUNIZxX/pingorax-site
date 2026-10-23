import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Entrada do programa do caller (veja docs/PROGRAMA.md). Autenticação: "Authorization: Bearer plx_..." (token criado no perfil).
//   GET  /api/public/logger            -> lista os conteúdos que o token pode alimentar
//   POST /api/public/logger            -> envia loot e dps: { event_id, session_id?, silver?, items?: [...], dps?: [...] }
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 200_000;

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(100000).optional(),
  unit_value: z.number().int().min(0).max(10_000_000_000).optional(),
  looted_by: z.string().trim().min(2).max(32).optional(),
  external_id: z.string().trim().min(1).max(80).optional(),
});
const dpsSchema = z.object({
  nick: z.string().trim().min(2).max(32),
  damage: z.number().int().min(0).max(1e13).optional(),
  healing: z.number().int().min(0).max(1e13).optional(),
});
const bodySchema = z.object({
  event_id: z.string().uuid(),
  session_id: z.string().uuid().optional(),
  silver: z.number().int().min(0).max(1e13).optional(),
  items: z.array(itemSchema).max(200).optional(),
  dps: z.array(dpsSchema).max(100).optional(),
});

function tokenOf(request: Request) {
  const m = /^Bearer\s+(plx_[A-Za-z0-9]{20,100})$/.exec(request.headers.get("authorization") ?? "");
  return m?.[1] ?? null;
}
function fail(status: number, error: string) { return Response.json({ ok: false, error }, { status, headers: NO_STORE }); }
function rpcError(message: string) {
  const known = /Token inválido|Você não edita|Sessão não encontrada|Muitos dados|Formato inválido/.test(message);
  return known ? fail(/Token/.test(message) ? 401 : 403, message) : fail(500, "Falha ao gravar. Tente de novo.");
}

async function client() {
  const { anonClient } = await import("@/lib/discord.server");
  return anonClient();
}

export const Route = createFileRoute("/api/public/logger")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const token = tokenOf(request);
        if (!token) return fail(401, "Token ausente ou em formato inválido.");
        try {
          const { data, error } = await (await client()).rpc("logger_my_events", { _token: token });
          if (error) return rpcError(error.message);
          return Response.json({ ok: true, events: data ?? [] }, { headers: NO_STORE });
        } catch (e) { console.error("[logger] eventos", e); return fail(500, "Falha ao consultar."); }
      },
      POST: async ({ request }: { request: Request }) => {
        const token = tokenOf(request);
        if (!token) return fail(401, "Token ausente ou em formato inválido.");
        const raw = await request.text();
        if (raw.length > MAX_BODY) return fail(413, "Envio grande demais.");
        let json: unknown;
        try { json = JSON.parse(raw); } catch { return fail(400, "JSON inválido."); }
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) return fail(400, `Dados inválidos: ${parsed.error.issues[0]?.path.join(".") || "corpo"}.`);
        const b = parsed.data;
        try {
          const { data, error } = await (await client()).rpc("logger_ingest", {
            _token: token, _event: b.event_id, ...(b.session_id ? { _session: b.session_id } : {}),
            _items: b.items ?? [], _dps: b.dps ?? [], ...(b.silver !== undefined ? { _silver: b.silver } : {}),
          });
          if (error) return rpcError(error.message);
          return Response.json({ ok: true, ...(data as object) }, { headers: NO_STORE });
        } catch (e) { console.error("[logger] envio", e); return fail(500, "Falha ao gravar."); }
      },
    },
  },
});
