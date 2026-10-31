import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { table: string; column: string; value: string }[] = [];
let result: { data: unknown[] | null; error: Error | null } = { data: [], error: null };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => ({ delete: () => ({ eq: (column: string, value: string) => { calls.push({ table, column, value }); return { select: () => Promise.resolve(result) }; } }) }) },
}));

import { clearChat, clearLoot, clearSessionDps, clearSessionItems, resetForReuse, reuseSummary } from "@/lib/cleanup";

beforeEach(() => { calls.length = 0; result = { data: [{ id: "1" }, { id: "2" }], error: null }; });

describe("limpezas para reutilizar o conteúdo", () => {
  it("cada função apaga só da tabela e do filtro certos", async () => {
    expect(await clearChat("e1")).toBe(2);
    await clearLoot("e1"); await clearSessionItems("s1"); await clearSessionDps("s1");
    expect(calls).toEqual([
      { table: "event_messages", column: "event_id", value: "e1" },
      { table: "loot_sessions", column: "event_id", value: "e1" },
      { table: "loot_items", column: "session_id", value: "s1" },
      { table: "dps_entries", column: "session_id", value: "s1" },
    ]);
  });
  it("repassa o erro do banco", async () => {
    result = { data: null, error: new Error("negado") };
    await expect(clearChat("e1")).rejects.toThrow("negado");
  });
  it("sem permissão ou já vazio devolve 0", async () => {
    result = { data: [], error: null };
    expect(await clearLoot("e1")).toBe(0);
  });
  it("reiniciar limpa só o que foi pedido", async () => {
    const r = await resetForReuse("e1", { chat: true, loot: false });
    expect(r).toEqual({ chat: 2, loot: null, failed: [] });
    expect(calls.map((c) => c.table)).toEqual(["event_messages"]);
  });
  it("um que falha não impede o outro", async () => {
    let n = 0;
    result = { data: [{ id: "1" }], error: null };
    const original = calls.push.bind(calls);
    calls.push = ((...items: typeof calls) => { n++; if (n === 1) result = { data: null, error: new Error("x") }; else result = { data: [{ id: "1" }], error: null }; return original(...items); }) as typeof calls.push;
    const r = await resetForReuse("e1", { chat: true, loot: true });
    expect(r).toEqual({ chat: null, loot: 1, failed: ["chat"] });
  });
  it("frases do aviso", () => {
    expect(reuseSummary({ chat: 1, loot: 3, failed: [] })).toBe("Apaguei 1 mensagem e 3 sessões de loot.");
    expect(reuseSummary({ chat: 0, loot: null, failed: [] })).toBe("Apaguei 0 mensagens.");
    expect(reuseSummary({ chat: null, loot: null, failed: [] })).toBe("Nada para apagar.");
    expect(reuseSummary({ chat: 2, loot: null, failed: ["loot e dps"] })).toBe("Apaguei 2 mensagens. Não consegui limpar: loot e dps.");
  });
});
