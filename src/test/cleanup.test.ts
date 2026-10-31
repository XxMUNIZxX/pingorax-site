import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as { table: string; column: string; value: string }[],
  results: [] as { data: unknown[] | null; error: Error | null }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: string) => {
          state.calls.push({ table, column, value });
          return { select: () => Promise.resolve(state.results.shift() ?? { data: [], error: null }) };
        },
      }),
    }),
  },
}));

import { clearChat, clearLoot, clearSessionDps, clearSessionItems, resetForReuse, reuseSummary } from "@/lib/cleanup";

const rows = (n: number) => ({ data: Array.from({ length: n }, (_, i) => ({ id: String(i) })), error: null });

beforeEach(() => { state.calls.length = 0; state.results.length = 0; });

describe("limpezas para reutilizar o conteúdo", () => {
  it("cada função apaga só da tabela e do filtro certos", async () => {
    state.results.push(rows(2));
    expect(await clearChat("e1")).toBe(2);
    await clearLoot("e1"); await clearSessionItems("s1"); await clearSessionDps("s1");
    expect(state.calls).toEqual([
      { table: "event_messages", column: "event_id", value: "e1" },
      { table: "loot_sessions", column: "event_id", value: "e1" },
      { table: "loot_items", column: "session_id", value: "s1" },
      { table: "dps_entries", column: "session_id", value: "s1" },
    ]);
  });
  it("repassa o erro do banco", async () => {
    state.results.push({ data: null, error: new Error("negado") });
    await expect(clearChat("e1")).rejects.toThrow("negado");
  });
  it("sem permissão ou já vazio devolve 0", async () => {
    state.results.push(rows(0));
    expect(await clearLoot("e1")).toBe(0);
  });
  it("reiniciar limpa só o que foi pedido", async () => {
    state.results.push(rows(2));
    expect(await resetForReuse("e1", { chat: true, loot: false })).toEqual({ chat: 2, loot: null, failed: [] });
    expect(state.calls.map((c) => c.table)).toEqual(["event_messages"]);
  });
  it("um que falha não impede o outro", async () => {
    state.results.push({ data: null, error: new Error("x") }, rows(1));
    expect(await resetForReuse("e1", { chat: true, loot: true })).toEqual({ chat: null, loot: 1, failed: ["chat"] });
  });
  it("frases do aviso", () => {
    expect(reuseSummary({ chat: 1, loot: 3, failed: [] })).toBe("Apaguei 1 mensagem e 3 sessões de loot.");
    expect(reuseSummary({ chat: 0, loot: null, failed: [] })).toBe("Apaguei 0 mensagens.");
    expect(reuseSummary({ chat: null, loot: null, failed: [] })).toBe("Nada para apagar.");
    expect(reuseSummary({ chat: 2, loot: null, failed: ["loot e dps"] })).toBe("Apaguei 2 mensagens. Não consegui limpar: loot e dps.");
  });
});
