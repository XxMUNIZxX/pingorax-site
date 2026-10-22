import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { nextStarting, startText, startsInMinutes } from "@/lib/upcoming";
import type { MyPing } from "@/lib/my-pings";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const ping = (id: string, minutesFromNow: number, status: MyPing["status"] = "confirmed"): MyPing => ({
  id, title: id, starts_at: new Date(NOW + minutesFromNow * 60_000).toISOString(), status, weapon: null, attendance: null,
});

describe("texto do aviso", () => {
  it("diz quanto falta ou há quanto tempo começou", () => {
    expect(startText(20)).toBe("começa em 20 min");
    expect(startText(0)).toBe("está começando agora");
    expect(startText(-12)).toBe("começou há 12 min");
    expect(startsInMinutes(ping("a", 25).starts_at, NOW)).toBe(25);
  });
});

describe("próximo conteúdo a começar", () => {
  it("escolhe o confirmado mais próximo dentro de 1 h", () => {
    expect(nextStarting([ping("longe", 180), ping("perto", 40), ping("mais-perto", 10)], NOW)?.id).toBe("mais-perto");
  });
  it("ainda avisa até 30 min depois de começar", () => {
    expect(nextStarting([ping("andando", -20)], NOW)?.id).toBe("andando");
    expect(nextStarting([ping("velho", -45)], NOW)).toBeNull();
  });
  it("ignora quem só está na fila e conteúdos distantes", () => {
    expect(nextStarting([ping("fila", 10, "waitlist"), ping("longe", 120)], NOW)).toBeNull();
  });
});
