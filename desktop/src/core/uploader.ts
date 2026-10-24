import type { Snapshot } from "./tracker";

export type SendResult = { ok: true; items: number; dps: number } | { ok: false; error: string };
export type EventInfo = { id: string; title: string; starts_at: string };

const BASE = "https://pingorax.online/api/public/logger";

async function call(token: string, init: RequestInit, base: string, fetchFn: typeof fetch) {
  const res = await fetchFn(base, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>;
  return { res, body };
}

/** Conteúdos que o token pode alimentar. */
export async function listEvents(token: string, base = BASE, fetchFn: typeof fetch = fetch): Promise<{ ok: true; events: EventInfo[] } | { ok: false; error: string }> {
  try {
    const { res, body } = await call(token, { method: "GET" }, base, fetchFn);
    if (!res.ok || body.ok === false) return { ok: false, error: body.error ?? `Erro ${res.status}` };
    return { ok: true, events: (body["events"] as EventInfo[] | undefined) ?? [] };
  } catch { return { ok: false, error: "Sem conexão com o PingoraX." }; }
}

/** Envia dps (foto atual), prata e os itens ainda não enviados. Devolve só o que foi aceito, para o app marcar como enviado. */
export async function sendSnapshot(token: string, eventId: string, snap: Snapshot, sentIds: Set<string>, opts: { base?: string; fetchFn?: typeof fetch } = {}): Promise<SendResult & { sent?: string[] }> {
  const fresh = snap.loot.filter((l) => !sentIds.has(l.externalId)).slice(0, 200);
  const payload = {
    event_id: eventId, silver: snap.silver,
    items: fresh.map((l) => ({ name: l.name, quantity: Math.min(l.quantity, 100000), unit_value: 0, looted_by: l.looter.length >= 2 ? l.looter.slice(0, 32) : undefined, external_id: l.externalId })),
    dps: snap.dps.slice(0, 100).filter((d) => d.nick.length >= 2).map((d) => ({ nick: d.nick.slice(0, 32), damage: d.damage, healing: d.healing })),
  };
  try {
    const { res, body } = await call(token, { method: "POST", body: JSON.stringify(payload) }, opts.base ?? BASE, opts.fetchFn ?? fetch);
    if (!res.ok || body.ok === false) return { ok: false, error: body.error ?? `Erro ${res.status}` };
    return { ok: true, items: Number(body["items_added"] ?? 0), dps: Number(body["dps_upserted"] ?? 0), sent: fresh.map((l) => l.externalId) };
  } catch { return { ok: false, error: "Sem conexão com o PingoraX." }; }
}
