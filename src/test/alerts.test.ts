import { describe, expect, it } from "vitest";
import { alertText, redact, shouldAlert } from "@/lib/alerts.server";

describe("aviso de erro", () => {
  it("esconde token do bot, webhook e chaves do Supabase", () => {
    // Montado em partes para o GitHub não confundir este valor de teste com um token de verdade.
    const bot = ["MTIzNDU2", "Nzg5MDEyMzQ1Njc4"].join("") + [".", "GabcDE", ".", "abcdefghijklmnopqrstuvwxyz", "123456"].join("");
    const hook = ["https://discord.com/api/", "webhooks/", "123456789012345678/", "abcdefghijklmnopqrstuvwxyz_-0123456789"].join("");
    const out = redact(`falhou com ${bot} e ${hook} e sb_secret_abcdefghijklmnop`);
    expect(out).not.toContain("MTIzNDU2");
    expect(out).not.toContain("webhooks/1234");
    expect(out).not.toContain("sb_secret_abc");
    expect(out).toContain("[token]");
    expect(out).toContain("[webhook]");
  });
  it("monta o texto com o motivo e corta mensagens enormes", () => {
    expect(alertText("Limpeza", new Error("Discord respondeu 403"))).toContain("Discord respondeu 403");
    expect(alertText("Limpeza", "x".repeat(5000)).length).toBeLessThan(1700);
  });
  it("não repete o mesmo aviso dentro de 30 minutos", () => {
    const state = new Map<string, number>();
    expect(shouldAlert("a", 0, state)).toBe(true);
    expect(shouldAlert("a", 10 * 60_000, state)).toBe(false);
    expect(shouldAlert("b", 10 * 60_000, state)).toBe(true);
    expect(shouldAlert("a", 31 * 60_000, state)).toBe(true);
  });
});
