import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMessage, canManageMessages, cleanupRange, deleteDiscordMessage } from "@/lib/discord.server";

const cfg = { botToken: "token" };
const event = (weapons: number) => ({
  id: "11111111-1111-4111-8111-111111111111", title: "Ava", description: null, starts_at: "2026-10-20T20:00:00Z", max_players: 20, mode: null, caller_name: null, content_type: null,
  event_weapons: Array.from({ length: weapons }, (_, i) => ({ id: `w${i}`, name: `Arma ${i}`, slots: 1, position: i })), signups: [],
});

describe("permissão para remover", () => {
  it("aceita Administrador, Gerenciar Servidor e Gerenciar Mensagens", () => {
    expect(canManageMessages("8")).toBe(true);
    expect(canManageMessages("32")).toBe(true);
    expect(canManageMessages("8192")).toBe(true);
  });
  it("recusa quem não tem nenhuma delas", () => {
    expect(canManageMessages("0")).toBe(false);
    expect(canManageMessages("2048")).toBe(false);
    expect(canManageMessages(undefined)).toBe(false);
    expect(canManageMessages("abc")).toBe(false);
  });
});

describe("janela da limpeza", () => {
  it("só pega conteúdos que passaram do prazo e ainda estão nas últimas 24 h", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const { newest, oldest } = cleanupRange(now, 60);
    expect(newest).toBe("2026-10-20T11:00:00.000Z");
    expect(oldest).toBe("2026-10-19T11:00:00.000Z");
  });
});

describe("botão Remover mensagem", () => {
  it("fica no card e nunca passa de 25 botões", () => {
    for (const n of [0, 3, 22, 30]) {
      const buttons = buildMessage(event(n)).components.flatMap((row) => row.components) as { custom_id?: string }[];
      expect(buttons.length).toBeLessThanOrEqual(25);
      expect(buttons.some((b) => b.custom_id === "x:11111111-1111-4111-8111-111111111111")).toBe(true);
    }
  });
});

describe("apagar mensagem no Discord", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (status: number) => {
    const fetchMock = vi.fn(async () => new Response(status === 204 ? null : "erro", { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("considera apagada a mensagem removida (204) ou que já não existe (404)", async () => {
    const fetchMock = stub(204);
    await expect(deleteDiscordMessage("123456", "654321", cfg)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://discord.com/api/v10/channels/123456/messages/654321", expect.objectContaining({ method: "DELETE" }));
    stub(404);
    await expect(deleteDiscordMessage("123456", "654321", cfg)).resolves.toBe(true);
  });
  it("avisa quando o bot não tem permissão", async () => {
    stub(403);
    await expect(deleteDiscordMessage("123456", "654321", cfg)).rejects.toThrow("403");
  });
});
