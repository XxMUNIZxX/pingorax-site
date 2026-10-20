import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { isMissingAttendance, summarizeAttendance } from "@/lib/attendance";

const now = Date.parse("2026-10-20T12:00:00Z");
const events = [
  { id: "e1", starts_at: "2026-10-10T20:00:00Z", signups: [{ nick: "Ana" }, { nick: "Bob" }] },
  { id: "e2", starts_at: "2026-10-17T20:00:00Z", signups: [{ nick: "ana" }, { nick: "Cid" }] },
  { id: "e3", starts_at: "2026-10-30T20:00:00Z", signups: [{ nick: "Ana" }] },
];

describe("resumo de presença", () => {
  const rows = [
    { event_id: "e1", nick: "Ana", present: true },
    { event_id: "e1", nick: "Bob", present: false },
    { event_id: "e2", nick: "ana", present: true },
    { event_id: "e3", nick: "Ana", present: true },
  ];
  const stats = summarizeAttendance(events, rows, now);
  const by = (nick: string) => stats.find((s) => s.nick.toLowerCase() === nick)!;

  it("junta nicks iguais sem diferenciar maiúsculas e ignora conteúdo futuro", () => {
    expect(by("ana")).toMatchObject({ signed: 2, present: 2, absent: 0, rate: 1 });
  });
  it("conta falta só quando foi marcada", () => {
    expect(by("bob")).toMatchObject({ signed: 1, present: 0, absent: 1, rate: 0 });
    expect(by("cid")).toMatchObject({ signed: 1, present: 0, absent: 0, rate: null });
  });
  it("ordena por presenças", () => {
    expect(stats[0]!.nick.toLowerCase()).toBe("ana");
  });
});

describe("tabela de presença ainda não criada", () => {
  it("reconhece o erro do Supabase", () => {
    expect(isMissingAttendance({ code: "PGRST205", message: "Could not find the table 'public.attendance' in the schema cache" })).toBe(true);
    expect(isMissingAttendance({ code: "23505", message: "duplicate" })).toBe(false);
  });
});
