import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { isMissingLoot, lootTotal, myShares, normalizeConfig, normalizePeople, normalizeResult } from "@/lib/loot";

describe("tabelas de loot ainda não criadas", () => {
  it("reconhece o erro do Supabase", () => {
    expect(isMissingLoot({ code: "42P01" })).toBe(true);
    expect(isMissingLoot({ code: "PGRST205", message: "Could not find the table 'public.loot_sessions' in the schema cache" })).toBe(true);
  });
  it("não confunde com outros erros", () => {
    expect(isMissingLoot(null)).toBe(false);
    expect(isMissingLoot({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

describe("configuração guardada", () => {
  it("lê o que está certo e ignora o resto", () => {
    expect(normalizeConfig({ method: "weighted", guildPercent: 150, fixedCut: -5, deductRepair: true, roleWeights: { tank: 2, healer: "x", dps: -1 } }))
      .toEqual({ method: "weighted", guildPercent: 100, fixedCut: 0, deductRepair: true, roleWeights: { tank: 2 } });
  });
  it("vazio ou lixo vira o padrão", () => {
    expect(normalizeConfig(null)).toEqual({ method: "equal", guildPercent: 0, fixedCut: 0, deductRepair: false, roleWeights: {} });
    expect(normalizeConfig("oi")).toEqual(normalizeConfig({}));
  });
  it("pessoas: limpa nick e valores", () => {
    expect(normalizePeople([{ nick: " Ana ", repair: 100.7, manualPercent: 130 }, { nick: "x" }, { nick: "Bia", excluded: true, extra: true }, 5, null]))
      .toEqual([{ nick: "Ana", repair: 100, manualPercent: 100 }, { nick: "Bia", excluded: true, extra: true }]);
    expect(normalizePeople("nada")).toEqual([]);
  });
});

describe("total do loot", () => {
  it("soma a prata direta e os itens (quantidade x valor)", () => {
    const items = [{ id: "1", session_id: "s", name: "A", quantity: 2, unit_value: 1000, looted_by: null }, { id: "2", session_id: "s", name: "B", quantity: 1, unit_value: 500, looted_by: null }];
    expect(lootTotal({ silver: 300, items })).toBe(2800);
  });
});

describe("histórico de loot", () => {
  it("lê o resultado guardado e ignora o que está errado", () => {
    expect(normalizeResult({ total: 1000.9, rows: [{ nick: " Ana ", total: 400.5 }, { nick: "", total: 1 }, { nick: "Bia", total: -3 }, { nick: "Cai", total: "x" }, 7] }))
      .toEqual({ total: 1000, rows: [{ nick: "Ana", total: 400 }] });
    expect(normalizeResult(null)).toBeNull();
    expect(normalizeResult({ total: 1 })).toBeNull();
  });
  it("acha quanto o jogador recebeu, sem diferenciar maiúsculas", () => {
    const sessions = [
      { id: "s1", event_id: "e1", title: "Loot", created_at: "2026-10-20T10:00:00Z", result: { total: 900, rows: [{ nick: "ANA", total: 300 }, { nick: "Bia", total: 600 }] }, events: { title: "Dungeon" } },
      { id: "s2", event_id: "e2", title: "Loot 2", created_at: "2026-10-21T10:00:00Z", result: { total: 100, rows: [{ nick: "Bia", total: 100 }] }, events: null },
      { id: "s3", event_id: "e3", title: "Sem resultado", created_at: "2026-10-22T10:00:00Z", result: null },
    ];
    expect(myShares(sessions, "ana")).toEqual([{ sessionId: "s1", eventId: "e1", eventTitle: "Dungeon", sessionTitle: "Loot", at: "2026-10-20T10:00:00Z", mine: 300 }]);
    expect(myShares(sessions, "Bia").map((e) => [e.sessionId, e.eventTitle, e.mine])).toEqual([["s1", "Dungeon", 600], ["s2", "Conteúdo", 100]]);
  });
});
