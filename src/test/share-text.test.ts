import { describe, expect, it } from "vitest";
import { buildLink, eventInviteText } from "@/lib/share-text";

const event = {
  id: "abc", title: "ZvZ Black Zone", starts_at: "2026-10-20T20:00:00Z", max_players: 20, mode: "PVP", caller_name: "Pingora", content_type: "ZvZ",
  event_weapons: [{ name: "Cajado Sagrado", slots: 2, position: 1, role: "healer" }, { name: "Espada", slots: 1, position: 0 }],
  signups: [1, 2, 3],
};

describe("texto de convite", () => {
  const text = eventInviteText(event, "https://pingorax.online/", "20/10 17:00");
  it("traz título, horário no formato do Discord, caller e vagas", () => {
    expect(text).toContain("**ZvZ Black Zone** — PVP • ZvZ");
    expect(text).toContain("<t:1792526400:F> (20/10 17:00)");
    expect(text).toContain("Caller: Pingora");
    expect(text).toContain("3/20 jogadores");
  });
  it("lista as armas na ordem, com função e singular/plural", () => {
    expect(text.indexOf("Espada")).toBeLessThan(text.indexOf("Cajado Sagrado"));
    expect(text).toContain("• Espada — 1 vaga");
    expect(text).toContain("• Cajado Sagrado (Healer) — 2 vagas");
  });
  it("termina com o link sem barra dupla", () => {
    expect(text.endsWith("Pingue aqui: https://pingorax.online/evento/abc")).toBe(true);
  });
});

describe("link de build", () => {
  it("abre a build pelo endereço", () => {
    expect(buildLink("https://pingorax.online/", "x1")).toBe("https://pingorax.online/builds?build=x1");
  });
});
