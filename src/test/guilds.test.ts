import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { SLUG_PATTERN, isMissingGuilds, slugify } from "@/lib/guilds";

describe("endereço da guilda", () => {
  it("tira acentos, símbolos e espaços", () => {
    expect(slugify("Guilda dos Pingoras!")).toBe("guilda-dos-pingoras");
    expect(slugify("  Ação & Reação  ")).toBe("acao-reacao");
  });
  it("respeita o limite de 30 letras e não termina em hífen", () => {
    const slug = slugify("a".repeat(29) + " b c d");
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith("-")).toBe(false);
  });
  it("devolve vazio quando não sobra o mínimo de 3", () => {
    expect(slugify("A!")).toBe("");
    expect(slugify("😀😀")).toBe("");
  });
  it("tudo o que o slugify devolve passa na regra do banco", () => {
    for (const name of ["Pingoras", "Os Quatro Cavaleiros do Ap0calipse", "ZvZ 24h"]) expect(SLUG_PATTERN.test(slugify(name))).toBe(true);
  });
});

describe("migração das guildas ainda não rodada", () => {
  it("reconhece tabela e coluna ausentes", () => {
    expect(isMissingGuilds({ code: "42P01" })).toBe(true);
    expect(isMissingGuilds({ code: "42703", message: "column events.guild_id does not exist" })).toBe(true);
    expect(isMissingGuilds({ code: "PGRST205", message: "Could not find the table 'public.guilds'" })).toBe(true);
  });
  it("não confunde com outros erros", () => {
    expect(isMissingGuilds(null)).toBe(false);
    expect(isMissingGuilds({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(false);
  });
});
