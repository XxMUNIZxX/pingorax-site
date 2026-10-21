import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { isMissingWaitlist } from "@/lib/waitlist";
import { buildMessage, reminderText } from "@/lib/discord.server";

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

import { promotionText } from "@/lib/discord.server";

describe("fila pelo Discord", () => {
  const buttons = (event: Parameters<typeof buildMessage>[0]) =>
    buildMessage(event).components.flatMap((row) => row.components) as { custom_id?: string; label?: string; disabled?: boolean }[];
  const weaponButton = (event: Parameters<typeof buildMessage>[0]) => buttons(event).find((b) => b.custom_id === "p:11111111-1111-4111-8111-111111111111:w1")!;

  it("arma lotada com a fila disponível continua clicável e vira botão de fila", () => {
    const button = weaponButton({ ...base, waitlist: [] });
    expect(button.disabled).toBe(false);
    expect(button.label).toBe("Cajado · fila");
  });
  it("sem a tabela da fila, arma lotada segue bloqueada como antes", () => {
    const button = weaponButton(base);
    expect(button.disabled).toBe(true);
    expect(button.label).toBe("Cajado (0)");
  });
  it("arma com vaga não muda", () => {
    const open = { ...base, max_players: 5, signups: [], waitlist: [] };
    const button = weaponButton(open);
    expect(button.disabled).toBe(false);
    expect(button.label).toBe("Cajado (2)");
  });
  it("aviso de promoção cita nick e arma e não vira menção", () => {
    const text = promotionText(base, [{ weapon_id: "w1", nick: "@everyone" }]);
    expect(text).toContain("\\@everyone");
    expect(text).toContain("garantiu a vaga de **Cajado**");
    expect(text).toContain("/evento/11111111-1111-4111-8111-111111111111");
  });
});

describe("guilda no card e no lembrete", () => {
  it("mostra o nome da guilda com link para a página dela", () => {
    const embed = buildMessage({ ...base, guild: { name: "Os Pingoras", slug: "os-pingoras" } }).embeds[0]! as { author?: { name: string; url: string } };
    expect(embed.author).toEqual({ name: "Os Pingoras", url: "https://pingorax.online/g/os-pingoras" });
  });
  it("sem guilda não tem autor no card", () => {
    expect((buildMessage(base).embeds[0]! as { author?: unknown }).author).toBeUndefined();
  });
});

describe("lembrete com guilda", () => {
  it("cita a guilda só quando existe", () => {
    expect(reminderText({ ...base, guild: { name: "Os Pingoras", slug: "os-pingoras" } })).toContain("Guilda: **Os Pingoras**");
    expect(reminderText(base)).not.toContain("Guilda:");
  });
});

describe("confirmação 'estou a caminho'", () => {
  it("põe ✅ no nick de quem confirmou", () => {
    const fields = buildMessage({ ...base, confirmed: ["A"] }).embeds[0]!.fields as { name: string; value: string }[];
    const weapon = fields.find((f) => f.name.startsWith("Cajado"))!;
    expect(weapon.value).toBe("✅ A, B");
  });
  it("sem confirmações o card fica como antes", () => {
    const fields = buildMessage(base).embeds[0]!.fields as { name: string; value: string }[];
    expect(fields.find((f) => f.name.startsWith("Cajado"))!.value).toBe("A, B");
  });
});
