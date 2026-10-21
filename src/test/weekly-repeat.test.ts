import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { weeklyStarts } from "@/lib/events";

describe("repetição semanal", () => {
  it("gera o mesmo horário nas semanas seguintes", () => {
    expect(weeklyStarts("2026-10-20T20:00:00.000Z", 2)).toEqual(["2026-10-27T20:00:00.000Z", "2026-11-03T20:00:00.000Z"]);
  });
  it("sem repetição não gera nada", () => {
    expect(weeklyStarts("2026-10-20T20:00:00.000Z", 0)).toEqual([]);
    expect(weeklyStarts("2026-10-20T20:00:00.000Z", -3)).toEqual([]);
  });
  it("limita a 12 semanas", () => {
    expect(weeklyStarts("2026-10-20T20:00:00.000Z", 99)).toHaveLength(12);
  });
});
