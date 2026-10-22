import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { buildMyPings, escapeLike } from "@/lib/my-pings";
import type { GameEvent } from "@/lib/events";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const ev = (id: string, startsAt: string): GameEvent => ({
  id, created_by: "u", title: `Conteúdo ${id}`, description: null, starts_at: startsAt, max_players: 20, mode: null, caller_name: null, content_type: null,
  event_weapons: [{ id: `w-${id}`, name: "Espada", slots: 2, position: 0, icon_path: null, icon_code: null, build_id: null }], signups: [],
});

describe("nick seguro para busca", () => {
  it("escapa coringas", () => {
    expect(escapeLike(" a%b_c\\d ")).toBe("a\\%b\\_c\\\\d");
  });
});

describe("meus pings", () => {
  const events = [ev("futuro", "2026-10-23T20:00:00Z"), ev("agora", "2026-10-22T10:30:00Z"), ev("fila", "2026-10-24T20:00:00Z"), ev("passou1", "2026-10-20T20:00:00Z"), ev("passou2", "2026-10-19T20:00:00Z"), ev("alheio", "2026-10-25T20:00:00Z")];
  const signups = [{ event_id: "futuro", weapon_id: "w-futuro" }, { event_id: "agora", weapon_id: "w-agora" }, { event_id: "passou1", weapon_id: "w-passou1" }, { event_id: "passou2", weapon_id: "w-passou2" }];
  const waitlist = [{ event_id: "fila", weapon_id: "w-fila" }];
  const attendance = [{ event_id: "passou1", nick: "ana", present: true }, { event_id: "passou2", nick: "ANA", present: false }, { event_id: "passou1", nick: "outra", present: false }];
  const out = buildMyPings(events, signups, waitlist, attendance, " Ana ", NOW);

  it("separa o que vem aí (inclui o que começou há menos de 3 h) do que passou", () => {
    expect(out.upcoming.map((p) => p.id)).toEqual(["agora", "futuro", "fila"]);
    expect(out.past.map((p) => p.id)).toEqual(["passou1", "passou2"]);
  });
  it("marca confirmado, fila e a arma", () => {
    expect(out.upcoming.find((p) => p.id === "fila")).toMatchObject({ status: "waitlist", weapon: "Espada" });
    expect(out.upcoming.find((p) => p.id === "futuro")?.status).toBe("confirmed");
  });
  it("conta a presença só do próprio nick, sem diferenciar maiúsculas", () => {
    expect(out.past.map((p) => p.attendance)).toEqual(["present", "absent"]);
    expect(out).toMatchObject({ present: 1, absent: 1, rate: 0.5 });
  });
  it("sem presença marcada não há taxa", () => {
    expect(buildMyPings(events, signups, [], null, "Ana", NOW).rate).toBeNull();
  });
});
