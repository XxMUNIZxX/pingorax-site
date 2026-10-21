import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  user_id: string; display_name: string; albion_nick: string | null; avatar_url: string | null;
  guild_id: string | null; albion_guild: string | null; guild_leader: boolean;
};
export type ProfileFields = { display_name: string; albion_nick: string | null; albion_guild: string | null; guild_id: string | null; guild_leader: boolean };
export type ProfileForm = { display_name: string; albion_nick: string; albion_guild: string; guild_id: string | null; guild_leader: boolean };

/** Erro de "tabela não existe": a migração 0014 ainda não foi rodada no Supabase. */
export function isMissingProfiles(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || (/profiles/i.test(text) && /(does not exist|schema cache|not found|could not find)/i.test(text));
}

type UserLike = { email?: string | undefined; user_metadata?: Record<string, unknown> | undefined };
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Nome e foto vindos do Discord/Google (ou do e-mail), para o primeiro perfil já nascer preenchido. */
export function profileDefaults(user: UserLike): { display_name: string; avatar_url: string | null } {
  const meta = user.user_metadata ?? {};
  const claims = (meta["custom_claims"] ?? {}) as Record<string, unknown>;
  const name = [claims["global_name"], meta["full_name"], meta["name"], meta["user_name"], user.email?.split("@")[0]].map(str).find((v) => v.length >= 2) ?? "Jogador";
  const avatar = [meta["avatar_url"], meta["picture"]].map(str).find((v) => /^https:\/\//.test(v) && v.length <= 500) ?? null;
  return { display_name: name.slice(0, 40), avatar_url: avatar };
}

/** Confere o formulário; devolve a mensagem de erro ou os campos já limpos para salvar. */
export function validateProfile(form: ProfileForm): { error: string } | { fields: ProfileFields } {
  const display_name = form.display_name.trim();
  const nick = form.albion_nick.trim();
  const guild = form.albion_guild.trim();
  if (display_name.length < 2 || display_name.length > 40) return { error: "O nome precisa ter de 2 a 40 letras." };
  if (nick && (nick.length < 2 || nick.length > 32)) return { error: "O nick do Albion precisa ter de 2 a 32 caracteres." };
  if (guild && (guild.length < 2 || guild.length > 40)) return { error: "O nome da guilda no jogo precisa ter de 2 a 40 caracteres." };
  const hasGuild = !!form.guild_id || !!guild;
  // Só faz sentido se declarar líder de uma guilda: sem guilda, a marca é descartada.
  return { fields: { display_name, albion_nick: nick || null, albion_guild: guild || null, guild_id: form.guild_id, guild_leader: hasGuild && form.guild_leader } };
}

/** `available: false` quando a migração 0014 ainda não foi rodada. */
export async function fetchProfile(userId: string): Promise<{ available: boolean; profile: Profile | null }> {
  const { data, error } = await supabase.from("profiles").select("user_id,display_name,albion_nick,avatar_url,guild_id,albion_guild,guild_leader").eq("user_id", userId).maybeSingle();
  if (error) { if (isMissingProfiles(error)) return { available: false, profile: null }; throw error; }
  return { available: true, profile: (data as Profile | null) ?? null };
}

export async function saveProfile(userId: string, avatarUrl: string | null, fields: ProfileFields) {
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, avatar_url: avatarUrl, ...fields }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function listGuildOptions(): Promise<{ id: string; slug: string; name: string }[]> {
  const { data, error } = await supabase.from("guilds").select("id,slug,name").order("name").limit(300);
  if (error) return [];
  return (data ?? []) as { id: string; slug: string; name: string }[];
}

export type GuildPerson = { user_id: string; display_name: string; albion_nick: string | null; avatar_url: string | null; leader: "owner" | "declared" | null };

/** Quem está na guilda. O dono da página é líder "de verdade"; quem só se declarou fica marcado como declarado. */
export function arrangePeople(rows: Profile[], ownerId: string): GuildPerson[] {
  return rows.map((r) => ({
    user_id: r.user_id, display_name: r.display_name, albion_nick: r.albion_nick, avatar_url: r.avatar_url,
    leader: r.user_id === ownerId ? "owner" as const : r.guild_leader ? "declared" as const : null,
  })).sort((a, b) => rank(a.leader) - rank(b.leader) || a.display_name.localeCompare(b.display_name, "pt-BR"));
}
const rank = (leader: GuildPerson["leader"]) => (leader === "owner" ? 0 : leader === "declared" ? 1 : 2);

export async function fetchGuildPeople(guildId: string, ownerId: string): Promise<GuildPerson[]> {
  const { data, error } = await supabase.from("profiles").select("user_id,display_name,albion_nick,avatar_url,guild_id,albion_guild,guild_leader").eq("guild_id", guildId).limit(200);
  if (error) return [];
  const rows = (data ?? []) as Profile[];
  // O dono entra na lista mesmo que o perfil dele não aponte para a guilda.
  if (!rows.some((r) => r.user_id === ownerId)) {
    const owner = await supabase.from("profiles").select("user_id,display_name,albion_nick,avatar_url,guild_id,albion_guild,guild_leader").eq("user_id", ownerId).maybeSingle();
    if (owner.data) rows.push(owner.data as Profile);
  }
  return arrangePeople(rows, ownerId);
}
