import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { mergeMessages, type ChatMessage } from "@/lib/chat";

// As tabelas do espaço (migração 0024) ainda não estão nos tipos gerados: usa o cliente sem tipos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any>;

export type SpaceRole = "owner" | "mod" | "member";
export type Space = { id: string; slug: string; name: string; role: SpaceRole };
export type Channel = { id: string; guild_id: string; kind: "text" | "voice"; name: string; position: number };
export type SpaceMember = { user_id: string; role: SpaceRole; name: string; nick: string | null; avatar_url: string | null };
export type Invite = { code: string; uses: number; max_uses: number; expires_at: string };
export type SpaceMessage = ChatMessage & { channel_id: string; user_id: string };

export const SPACE_MESSAGE_MAX = 1000;
export const canModerate = (role: SpaceRole) => role === "owner" || role === "mod";

/** Erro de "tabela/função não existe": a migração 0024 ainda não foi rodada. */
export function isMissingSpaces(error: { message?: string | undefined; code?: string | undefined } | null | undefined) {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202"
    || (/guild_(members|channels|messages|invites)|join_guild|send_guild_message/i.test(text) && /(does not exist|schema cache|not found|could not find)/i.test(text));
}

/** Nome do canal como aparece na lista: texto vira minúsculo sem espaços (#geral), voz mantém o nome. */
export function channelName(kind: "text" | "voice", raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim();
  return kind === "text" ? clean.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 30) : clean.slice(0, 30);
}

/** Texto, depois voz; dentro de cada um por posição e nome. */
export function sortChannels(list: Channel[]): Channel[] {
  return [...list].sort((a, b) => (a.kind === b.kind ? a.position - b.position || a.name.localeCompare(b.name) : a.kind === "text" ? -1 : 1));
}

/** Link de convite para colar em qualquer lugar. */
export const inviteLink = (origin: string, code: string) => `${origin}/sala?convite=${encodeURIComponent(code)}`;

/** Guildas em que a pessoa é dona ou membro. `null` quando a migração 0024 não foi rodada. */
export async function fetchMySpaces(userId: string): Promise<Space[] | null> {
  const [owned, member] = await Promise.all([
    db.from("guilds").select("id,slug,name").eq("owner_id", userId),
    db.from("guild_members").select("guild_id,role").eq("user_id", userId),
  ]);
  if (member.error) { if (isMissingSpaces(member.error)) return null; throw member.error; }
  if (owned.error) throw owned.error;
  const roles = new Map<string, SpaceRole>((member.data ?? []).map((m: { guild_id: string; role: string }) => [m.guild_id, m.role === "mod" ? "mod" : "member"]));
  const ownedIds = new Set((owned.data ?? []).map((g: { id: string }) => g.id));
  const extra = [...roles.keys()].filter((id) => !ownedIds.has(id));
  const others = extra.length ? await db.from("guilds").select("id,slug,name").in("id", extra) : { data: [], error: null };
  if (others.error) throw others.error;
  const all = [...(owned.data ?? []).map((g: { id: string; slug: string; name: string }) => ({ ...g, role: "owner" as SpaceRole })),
    ...(others.data ?? []).map((g: { id: string; slug: string; name: string }) => ({ ...g, role: roles.get(g.id) ?? "member" }))];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchChannels(guildId: string): Promise<Channel[]> {
  const { data, error } = await db.from("guild_channels").select("id,guild_id,kind,name,position").eq("guild_id", guildId);
  if (error) throw error;
  return sortChannels((data ?? []) as Channel[]);
}

export async function createChannel(guildId: string, kind: "text" | "voice", rawName: string): Promise<void> {
  const name = channelName(kind, rawName);
  if (name.length < 2) throw new Error("O nome precisa ter de 2 a 30 caracteres.");
  const { error } = await db.from("guild_channels").insert({ guild_id: guildId, kind, name, position: 10 });
  if (error) throw new Error(error.code === "23505" ? "Já existe um canal com esse nome." : error.message);
}

export async function deleteChannel(id: string): Promise<void> {
  const { error } = await db.from("guild_channels").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchSpaceMessages(channelId: string): Promise<SpaceMessage[]> {
  const { data, error } = await db.from("guild_messages").select("id,channel_id,user_id,nick,body,created_at").eq("channel_id", channelId).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return mergeMessages([], (data ?? []).map(toMessage)) as SpaceMessage[];
}

/** As linhas do espaço usam channel_id; o chat dos conteúdos usa event_id: o campo event_id carrega o canal para reaproveitar a lista. */
export function toMessage(row: { id: string; channel_id: string; user_id: string; nick: string; body: string; created_at: string }): SpaceMessage {
  return { id: row.id, event_id: row.channel_id, channel_id: row.channel_id, user_id: row.user_id, nick: row.nick, body: row.body, created_at: row.created_at };
}

export async function sendSpaceMessage(channelId: string, body: string): Promise<SpaceMessage> {
  const { data, error } = await db.rpc("send_guild_message", { _channel: channelId, _body: body });
  if (error) throw new Error(error.message);
  return toMessage(data as never);
}

export async function deleteSpaceMessage(id: string): Promise<void> {
  const { error } = await db.from("guild_messages").delete().eq("id", id);
  if (error) throw error;
}

/** Apaga todas as mensagens do canal (só moderação, pelas regras do banco). */
export async function clearChannel(channelId: string): Promise<void> {
  const { error } = await db.from("guild_messages").delete().eq("channel_id", channelId);
  if (error) throw error;
}

export async function fetchSpaceMembers(guildId: string): Promise<SpaceMember[]> {
  const [guild, members] = await Promise.all([
    db.from("guilds").select("owner_id").eq("id", guildId).maybeSingle(),
    db.from("guild_members").select("user_id,role").eq("guild_id", guildId),
  ]);
  if (members.error) throw members.error;
  const ownerId = (guild.data as { owner_id: string } | null)?.owner_id;
  const rows = [...(ownerId ? [{ user_id: ownerId, role: "owner" }] : []), ...((members.data ?? []) as { user_id: string; role: string }[])];
  const profiles = rows.length ? await db.from("profiles").select("user_id,display_name,albion_nick,avatar_url").in("user_id", rows.map((r) => r.user_id)) : { data: [] };
  const byId = new Map(((profiles.data ?? []) as { user_id: string; display_name: string; albion_nick: string | null; avatar_url: string | null }[]).map((p) => [p.user_id, p]));
  const rank: Record<string, number> = { owner: 0, mod: 1, member: 2 };
  return rows.map((r) => {
    const p = byId.get(r.user_id);
    return { user_id: r.user_id, role: r.role as SpaceRole, name: p?.albion_nick?.trim() || p?.display_name || "Membro", nick: p?.albion_nick ?? null, avatar_url: p?.avatar_url ?? null };
  }).sort((a, b) => rank[a.role]! - rank[b.role]! || a.name.localeCompare(b.name));
}

export async function setMemberRole(guildId: string, userId: string, role: "mod" | "member"): Promise<void> {
  const { error } = await db.from("guild_members").update({ role }).eq("guild_id", guildId).eq("user_id", userId);
  if (error) throw error;
}

export async function removeMember(guildId: string, userId: string): Promise<void> {
  const { error } = await db.from("guild_members").delete().eq("guild_id", guildId).eq("user_id", userId);
  if (error) throw error;
}

export async function fetchInvites(guildId: string): Promise<Invite[]> {
  const { data, error } = await db.from("guild_invites").select("code,uses,max_uses,expires_at").eq("guild_id", guildId).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invite[];
}

export async function createInvite(guildId: string): Promise<Invite> {
  const { data, error } = await db.from("guild_invites").insert({ guild_id: guildId }).select("code,uses,max_uses,expires_at").single();
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Você já tem 10 convites ativos. Apague algum antes de criar outro." : error.message);
  return data as Invite;
}

export async function revokeInvite(code: string): Promise<void> {
  const { error } = await db.from("guild_invites").delete().eq("code", code);
  if (error) throw error;
}

/** Entra na guilda com o código do convite; devolve o slug. */
export async function joinWithCode(code: string): Promise<string> {
  const { data, error } = await db.rpc("join_guild", { _code: code });
  if (error) throw new Error(error.message);
  return data as string;
}
