import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canJoinVoice, roomName } from "@/lib/voice";
import { signLiveKitToken } from "@/lib/voice.server";

describe("quem entra na sala de voz", () => {
  const base = { nick: "Ana", signups: ["Bia", "ana"], waitlist: ["Caio"], caller: "Dudu", manager: false };
  it("aceita quem pingou, está na fila ou é o caller (sem diferenciar maiúsculas)", () => {
    expect(canJoinVoice(base)).toBe(true);
    expect(canJoinVoice({ ...base, nick: "caio" })).toBe(true);
    expect(canJoinVoice({ ...base, nick: " DUDU " })).toBe(true);
  });
  it("aceita quem gerencia o conteúdo mesmo sem ping", () => {
    expect(canJoinVoice({ ...base, nick: null, manager: true })).toBe(true);
  });
  it("recusa quem não pingou ou não tem nick", () => {
    expect(canJoinVoice({ ...base, nick: "Zed" })).toBe(false);
    expect(canJoinVoice({ ...base, nick: null })).toBe(false);
    expect(canJoinVoice({ ...base, nick: "a" })).toBe(false);
  });
  it("a sala é uma por conteúdo", () => {
    expect(roomName("abc")).toBe("pingorax-abc");
  });
});

describe("chave de acesso do LiveKit", () => {
  it("é um JWT HS256 válido, só para a sala pedida", async () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    const token = await signLiveKitToken({ apiKey: "key", apiSecret: "segredo", room: "pingorax-e1", identity: "u1", name: "Ana", now });
    const [h, p, sig] = token.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload).toMatchObject({ iss: "key", sub: "u1", name: "Ana", nbf: now / 1000, exp: now / 1000 + 4 * 3600 });
    expect(payload.video).toMatchObject({ room: "pingorax-e1", roomJoin: true, canPublish: true, canSubscribe: true });
    expect(sig).toBe(createHmac("sha256", "segredo").update(`${h}.${p}`).digest("base64url"));
  });
});
