import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { hidePrivate: boolean }[] = [];
let failPrivate = false;

// Consulta falsa: registra se o filtro "is_private = false" foi aplicado e pode simular a coluna ausente.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const state = { hidePrivate: false };
        const result = () => {
          calls.push({ ...state });
          return state.hidePrivate && failPrivate
            ? { data: null, error: { code: "42703", message: "column events.is_private does not exist" } }
            : { data: [], error: null };
        };
        const builder: Record<string, unknown> = {
          order: () => builder,
          eq: (column: string, value: unknown) => { if (column === "is_private" && value === false) state.hidePrivate = true; return builder; },
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return builder;
      },
    }),
  },
}));

import { fetchEvents, isMissingPrivateColumn } from "@/lib/events";

beforeEach(() => { calls.length = 0; failPrivate = false; });

describe("lista pública sem conteúdo privado", () => {
  it("filtra os privados", async () => {
    await fetchEvents();
    expect(calls).toEqual([{ hidePrivate: true }]);
  });
  it("sem a migração 0015 repete a consulta sem o filtro", async () => {
    failPrivate = true;
    await expect(fetchEvents()).resolves.toEqual([]);
    expect(calls).toEqual([{ hidePrivate: true }, { hidePrivate: false }]);
  });
});

describe("coluna is_private ausente", () => {
  it("reconhece o erro do Supabase", () => {
    expect(isMissingPrivateColumn({ code: "42703" })).toBe(true);
    expect(isMissingPrivateColumn({ code: "PGRST204", message: "Could not find the 'is_private' column of 'events' in the schema cache" })).toBe(true);
    expect(isMissingPrivateColumn({ code: "23505", message: "duplicate" })).toBe(false);
    expect(isMissingPrivateColumn(null)).toBe(false);
  });
});
