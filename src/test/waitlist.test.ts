import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { isMissingWaitlist } from "@/lib/waitlist";
import { buildMessage } from "@/lib/discord.server";

const base = {
  id: "11111111-1111-4111-8111-111111111111", title: "ZvZ", description: null, starts_at: "2026-10-20T20:00:00Z", max_players: 2, mode: null, caller_name: null, content_type: null,
  event_weapons: [{ id: "w1", name: "Cajado", slots: 2, position: 0 }],
  signups: [{ id: "s1", nick: "A", weapon_id: "w1", created_at: "" }, { id: "s2", nick: "B", weapon_id: "w1", created_at: "" }],
};

describe("tabela da fila ainda não criada", () => {
  it("reconhece o erro do Supabase", () => {
    expect(isMissingWaitlist({ code: "42P01" })).toBe(true);
    expect(isMissingWaitlist({ code: "PGRST205", message: "Could not find the table 'public.waitlist' in the schema cache" })).toBe(true);
    expect(isMissingWaitlist({ message: 'relation "public.waitlist" does not exist' })).toBe(true);
  });
  it("não confunde com outros erros", () => {
    expect(isMissingWaitlist(null)).toBe(false);
    expect(isMissingWaitlist({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("fila no card do Discord", () => {
  const fields = (waitlist?: { nick: string; weapon_id: string }[]) =>
    (buildMessage({ ...base, ...(waitlist ? { waitlist } : {}) }).embeds[0]!.fields as { name: string; value: string }[]);

  it("não mostra nada sem fila", () => {
    expect(fields().some((f) => f.name.startsWith("Fila"))).toBe(false);
    expect(fields([]).some((f) => f.name.startsWith("Fila"))).toBe(false);
  });
  it("lista a fila em ordem e resume quando passa de 10", () => {
    const queue = Array.from({ length: 12 }, (_, i) => ({ nick: `P${i + 1}`, weapon_id: "w1" }));
    const field = fields(queue).find((f) => f.name.startsWith("Fila"))!;
    expect(field.name).toBe("Fila de espera (12)");
    expect(field.value.split("\n")[0]).toBe("1. P1");
    expect(field.value).toContain("+2…");
  });
});
