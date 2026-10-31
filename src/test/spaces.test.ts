import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { canModerate, channelName, inviteLink, isMissingSpaces, sortChannels, toMessage, type Channel } from "@/lib/spaces";
import { channelRoomName } from "@/lib/voice";

describe("espaço da guilda", () => {
  it("nome de canal de texto vira minúsculo com hífens; voz mantém o nome", () => {
    expect(channelName("text", "  Loot  Diário! ")).toBe("loot-diário");
    expect(channelName("voice", "  ZvZ   Sala 2 ")).toBe("ZvZ Sala 2");
    expect(channelName("text", "!!").length).toBeLessThan(2);
    expect(channelName("text", "a".repeat(80))).toHaveLength(30);
  });
  it("ordena texto antes de voz, depois por posição e nome", () => {
    const c = (id: string, kind: Channel["kind"], name: string, position = 0): Channel => ({ id, guild_id: "g", kind, name, position });
    expect(sortChannels([c("1", "voice", "A"), c("2", "text", "z"), c("3", "text", "b"), c("4", "text", "a", 5)]).map((x) => x.id)).toEqual(["3", "2", "4", "1"]);
  });
  it("só dono e moderador moderam", () => {
    expect(canModerate("owner")).toBe(true); expect(canModerate("mod")).toBe(true); expect(canModerate("member")).toBe(false);
  });
  it("monta o link do convite e a sala de voz do canal", () => {
    expect(inviteLink("https://pingorax.online", "abc 1")).toBe("https://pingorax.online/sala?convite=abc%201");
    expect(channelRoomName("x")).toBe("pingorax-canal-x");
  });
  it("reconhece falta da migração 0024", () => {
    expect(isMissingSpaces({ code: "PGRST205" })).toBe(true);
    expect(isMissingSpaces({ message: "function join_guild does not exist" })).toBe(true);
    expect(isMissingSpaces({ message: "Convite inválido" })).toBe(false);
    expect(isMissingSpaces(null)).toBe(false);
  });
  it("converte a linha do banco para mensagem de lista", () => {
    const m = toMessage({ id: "1", channel_id: "c", user_id: "u", nick: "Ana", body: "oi", created_at: "2026-01-01T00:00:00Z" });
    expect(m).toMatchObject({ id: "1", event_id: "c", user_id: "u", nick: "Ana" });
  });
});
