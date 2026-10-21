import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { arrangePeople, isMissingProfiles, profileDefaults, validateNick, validateProfile, type Profile } from "@/lib/profiles";

describe("perfil inicial vindo do Discord/Google", () => {
  it("usa o nome de exibição do Discord antes dos outros", () => {
    const d = profileDefaults({ email: "a@b.com", user_metadata: { custom_claims: { global_name: "Pingora" }, full_name: "Fulano", avatar_url: "https://cdn.discordapp.com/x.png" } });
    expect(d).toEqual({ display_name: "Pingora", avatar_url: "https://cdn.discordapp.com/x.png" });
  });
  it("Google: nome completo e foto (picture)", () => {
    expect(profileDefaults({ user_metadata: { full_name: "Maria Silva", picture: "https://lh3.googleusercontent.com/a" } })).toEqual({ display_name: "Maria Silva", avatar_url: "https://lh3.googleusercontent.com/a" });
  });
  it("cai para o começo do e-mail e depois para 'Jogador'", () => {
    expect(profileDefaults({ email: "caller.top@gmail.com" }).display_name).toBe("caller.top");
    expect(profileDefaults({}).display_name).toBe("Jogador");
  });
  it("ignora foto que não é https e corta nome comprido", () => {
    expect(profileDefaults({ user_metadata: { avatar_url: "http://x/y.png" } }).avatar_url).toBeNull();
    expect(profileDefaults({ user_metadata: { name: "x".repeat(80) } }).display_name).toHaveLength(40);
  });
});

describe("validação do perfil", () => {
  const base = { display_name: " Ana ", albion_nick: " AnaPvP ", albion_guild: "", guild_id: null, guild_leader: true };
  it("limpa os campos e vazio vira nulo", () => {
    expect(validateProfile(base)).toEqual({ fields: { display_name: "Ana", albion_nick: "AnaPvP", albion_guild: null, guild_id: null, guild_leader: false } });
  });
  it("só mantém 'líder' quando há guilda (do site ou do jogo)", () => {
    expect(validateProfile({ ...base, albion_guild: "Os Pingoras" })).toMatchObject({ fields: { guild_leader: true } });
    expect(validateProfile({ ...base, guild_id: "g1" })).toMatchObject({ fields: { guild_leader: true } });
  });
  it("recusa nomes fora do tamanho", () => {
    expect(validateProfile({ ...base, display_name: "A" })).toHaveProperty("error");
    expect(validateProfile({ ...base, albion_nick: "x".repeat(33) })).toHaveProperty("error");
    expect(validateProfile({ ...base, albion_guild: "x".repeat(41) })).toHaveProperty("error");
  });
});

describe("pessoas da guilda", () => {
  const p = (id: string, name: string, leader = false): Profile => ({ user_id: id, display_name: name, albion_nick: null, avatar_url: null, guild_id: "g", albion_guild: null, guild_leader: leader });
  const people = arrangePeople([p("u3", "Zeca"), p("u2", "Beto", true), p("u1", "Ana")], "u1");
  it("o dono vem primeiro como líder de verdade, depois os declarados, depois os membros", () => {
    expect(people.map((x) => [x.display_name, x.leader])).toEqual([["Ana", "owner"], ["Beto", "declared"], ["Zeca", null]]);
  });
});

describe("migração dos perfis ainda não rodada", () => {
  it("reconhece o erro", () => {
    expect(isMissingProfiles({ code: "PGRST205", message: "Could not find the table 'public.profiles'" })).toBe(true);
    expect(isMissingProfiles({ code: "23505", message: "duplicate" })).toBe(false);
  });
});

describe("nick pedido no primeiro login", () => {
  it("limpa espaços e aceita de 2 a 32 caracteres", () => {
    expect(validateNick("  Pingora   X ")).toEqual({ nick: "Pingora X" });
    expect(validateNick("ab")).toEqual({ nick: "ab" });
  });
  it("recusa nick curto, vazio ou longo demais", () => {
    expect("error" in validateNick("a")).toBe(true);
    expect("error" in validateNick("   ")).toBe(true);
    expect("error" in validateNick("x".repeat(33))).toBe(true);
  });
});
