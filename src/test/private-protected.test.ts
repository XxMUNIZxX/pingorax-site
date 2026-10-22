import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const created: { url: string; key: string; options: { global?: { headers?: Record<string, string> } } }[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: { global?: { headers?: Record<string, string> } }) => { created.push({ url, key, options }); return { __client: created.length }; },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { LINK_HEADER, linkClient } from "@/lib/event-link";
import { anonClient } from "@/lib/discord.server";

const ID = "11111111-1111-4111-8111-111111111111";
const ENV = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

beforeEach(() => {
  created.length = 0;
  process.env["SUPABASE_URL"] = "https://x.supabase.co";
  process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
  delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
});
afterEach(() => { for (const name of ENV) delete process.env[name]; });

describe("cliente do link (site)", () => {
  it("manda o id do conteúdo no cabeçalho do link", () => {
    linkClient(ID);
    expect(created.at(-1)?.options.global?.headers).toEqual({ [LINK_HEADER]: ID });
  });
  it("reaproveita o cliente do mesmo conteúdo e separa os de outros", () => {
    const a = linkClient("22222222-2222-4222-8222-222222222222");
    expect(linkClient("22222222-2222-4222-8222-222222222222")).toBe(a);
    expect(linkClient("33333333-3333-4333-8333-333333333333")).not.toBe(a);
  });
});

describe("cliente do bot", () => {
  it("sem chave de serviço, manda o cabeçalho do link do conteúdo pedido", () => {
    anonClient(ID);
    expect(created.at(-1)).toMatchObject({ key: "sb_publishable_test" });
    expect(created.at(-1)?.options.global?.headers).toEqual({ [LINK_HEADER]: ID });
  });
  it("sem conteúdo específico, não manda cabeçalho", () => {
    anonClient();
    expect(created.at(-1)?.options.global?.headers).toBeUndefined();
  });
  it("com a chave de serviço, usa ela (o bot enxerga os privados)", () => {
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "service-key";
    anonClient(ID);
    expect(created.at(-1)?.key).toBe("service-key");
  });
});
