import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE, chatTime, effectiveVolume, groupMessages, isForbiddenKey, isTypingTarget, keyLabel, micLevel, nickHue, normalizeVoice, volumeKey } from "@/lib/voice-settings";

describe("ajustes de voz guardados", () => {
  it("vazio ou lixo vira o padrão", () => {
    expect(normalizeVoice(null)).toEqual(DEFAULT_VOICE);
    expect(normalizeVoice("oi")).toEqual(DEFAULT_VOICE);
  });
  it("limita os valores e ignora o que está errado", () => {
    const s = normalizeVoice({ mode: "ptt", master: 9, pttRelease: -5, pttKey: "", noiseSuppression: "x", volumes: { Ana: 5, Bia: "x", Cai: 0.5 } });
    expect(s.mode).toBe("ptt"); expect(s.master).toBe(2); expect(s.pttRelease).toBe(0); expect(s.pttKey).toBe("KeyV"); expect(s.noiseSuppression).toBe(true);
    expect(s.volumes).toEqual({ Ana: 2, Cai: 0.5 });
  });
  it("modo desconhecido vira microfone aberto", () => { expect(normalizeVoice({ mode: "outro" }).mode).toBe("open"); });
});

describe("volumes", () => {
  it("combina o geral com o da pessoa e zera quando ensurdecido", () => {
    const s = normalizeVoice({ master: 0.5, volumes: { ana: 1.5 } });
    expect(effectiveVolume(s, " ANA ", false)).toBeCloseTo(0.75);
    expect(effectiveVolume(s, "Bia", false)).toBeCloseTo(0.5);
    expect(effectiveVolume(s, "Ana", true)).toBe(0);
    expect(volumeKey("  Ana ")).toBe("ana");
  });
});

describe("tecla de aperte para falar", () => {
  it("nomes legíveis", () => {
    expect(keyLabel("KeyV")).toBe("V"); expect(keyLabel("Digit3")).toBe("3"); expect(keyLabel("Space")).toBe("Espaço"); expect(keyLabel("Numpad5")).toBe("Num 5"); expect(keyLabel("F8")).toBe("F8");
  });
  it("recusa Esc e Windows", () => { expect(isForbiddenKey("Escape")).toBe(true); expect(isForbiddenKey("MetaLeft")).toBe(true); expect(isForbiddenKey("KeyV")).toBe(false); });
  it("não aciona enquanto digita", () => {
    expect(isTypingTarget({ tagName: "input" })).toBe(true); expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false); expect(isTypingTarget(null)).toBe(false);
  });
});

describe("avatar e nível do microfone", () => {
  it("a cor é estável e não diferencia maiúsculas", () => { expect(nickHue("Ana")).toBe(nickHue(" ana ")); expect(nickHue("Ana")).toBeGreaterThanOrEqual(0); expect(nickHue("Ana")).toBeLessThan(360); });
  it("silêncio é zero e sinal alto é limitado a 1", () => {
    expect(micLevel(new Uint8Array(64).fill(128))).toBe(0);
    expect(micLevel(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)))).toBe(1);
    expect(micLevel([])).toBe(0);
  });
});

describe("chat estilo Discord", () => {
  const m = (id: string, nick: string, at: string) => ({ id, nick, created_at: at });
  it("agrupa mensagens seguidas da mesma pessoa e separa quando passa de 5 minutos", () => {
    const g = groupMessages([m("1", "Ana", "2026-10-30T10:00:00Z"), m("2", "ana", "2026-10-30T10:02:00Z"), m("3", "Bia", "2026-10-30T10:03:00Z"), m("4", "Ana", "2026-10-30T10:04:00Z"), m("5", "Ana", "2026-10-30T10:20:00Z")]);
    expect(g.map((x) => x.items.map((i) => i.id))).toEqual([["1", "2"], ["3"], ["4"], ["5"]]);
  });
  it("hora curta hoje, ontem e data completa antes", () => {
    const now = new Date(2026, 9, 30, 15, 0);
    expect(chatTime(new Date(2026, 9, 30, 9, 5).toISOString(), now)).toBe("09:05");
    expect(chatTime(new Date(2026, 9, 29, 23, 40).toISOString(), now)).toBe("ontem 23:40");
    expect(chatTime(new Date(2026, 9, 20, 8, 0).toISOString(), now)).toBe("20/10 08:00");
    expect(chatTime("lixo", now)).toBe("");
  });
});
