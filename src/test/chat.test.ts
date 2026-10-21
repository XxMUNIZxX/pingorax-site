import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { CHAT_MAX, cleanMessage, isMissingChat, mergeMessages, type ChatMessage } from "@/lib/chat";

const msg = (id: string, at: string, body = "oi"): ChatMessage => ({ id, event_id: "e", nick: "Ana", body, created_at: at });

describe("mensagem do chat", () => {
  it("tira espaços e junta quebras de linha demais", () => {
    expect(cleanMessage("  oi  ")).toBe("oi");
    expect(cleanMessage("a\n\n\n\nb")).toBe("a\n\nb");
  });
  it("recusa vazia ou maior que o limite", () => {
    expect(cleanMessage("   ")).toBeNull();
    expect(cleanMessage("x".repeat(CHAT_MAX))).not.toBeNull();
    expect(cleanMessage("x".repeat(CHAT_MAX + 1))).toBeNull();
  });
});

describe("lista de mensagens", () => {
  it("não repete e ordena por horário", () => {
    const out = mergeMessages([msg("2", "2026-10-21T10:00:02Z")], [msg("1", "2026-10-21T10:00:01Z"), msg("2", "2026-10-21T10:00:02Z")]);
    expect(out.map((m) => m.id)).toEqual(["1", "2"]);
  });
  it("mantém só as mais recentes", () => {
    const many = Array.from({ length: 5 }, (_, i) => msg(String(i), `2026-10-21T10:00:0${i}Z`));
    expect(mergeMessages([], many, 3).map((m) => m.id)).toEqual(["2", "3", "4"]);
  });
});

describe("chat ainda não instalado", () => {
  it("reconhece o erro do Supabase", () => {
    expect(isMissingChat({ code: "42P01" })).toBe(true);
    expect(isMissingChat({ code: "PGRST205" })).toBe(true);
    expect(isMissingChat({ message: "Could not find the function public.send_event_message in the schema cache" })).toBe(true);
  });
  it("não confunde com outros erros", () => {
    expect(isMissingChat(null)).toBe(false);
    expect(isMissingChat({ code: "P0001", message: "Calma! Muitas mensagens seguidas." })).toBe(false);
  });
});
