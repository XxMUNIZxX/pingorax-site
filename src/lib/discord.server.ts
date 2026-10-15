import { publicShareClient } from "@/lib/share-image.server";
import { SHARE_ORIGIN } from "@/lib/share-image";
import { serverEnv } from "@/lib/server-env";

const API = "https://discord.com/api/v10";
const COLOR = 0x5fd0e8;

type Row = {
  id: string; title: string; description: string | null; starts_at: string; max_players: number;
  mode: string | null; caller_name: string | null; content_type: string | null;
  event_weapons: { id: string; name: string; slots: number; position: number; icon_code?: string | null }[];
  signups: { id: string; nick: string; weapon_id: string; created_at: string }[];
};

export type DiscordConfig = { publicKey?: string | undefined; botToken?: string | undefined; channelId?: string | undefined; appId?: string | undefined };
// Colar a chave com espaço/quebra de linha no fim é comum: limpa antes de usar.
const env = serverEnv;
export const discordConfig = (): DiscordConfig => ({
  publicKey: env("DISCORD_PUBLIC_KEY")?.toLowerCase(), botToken: env("DISCORD_BOT_TOKEN"), channelId: env("DISCORD_CHANNEL_ID"), appId: env("DISCORD_APP_ID"),
});

export function anonClient() {
  const url = serverEnv("SUPABASE_URL"); const key = serverEnv("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Servidor sem SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.");
  return publicShareClient(url, key);
}

export async function loadEvent(id: string): Promise<Row | null> {
  const { data, error } = await anonClient().from("events")
    .select("id,title,description,starts_at,max_players,mode,caller_name,content_type,event_weapons(id,name,slots,position,icon_code),signups(id,nick,weapon_id,created_at)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// Evita que um nick com @everyone, markdown ou link vire menção/formatação no canal.
const safeNick = (nick: string) => nick.replace(/[\\*_`~|>@#<\[\]()]/g, "\\$&");


// ---- Ícones das armas: emojis do aplicativo (o Discord só mostra imagem em botão/texto assim) ----
type AppEmoji = { id: string; name: string };
export type EmojiMap = Map<string, AppEmoji>;
const emojiNameOf = (code: string) => `w_${code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.replace(/_+$/, "").slice(0, 32);
const itemIconUrl = (code: string, size: number) => `https://render.albiononline.com/v1/item/${encodeURIComponent(code)}.png?quality=1&size=${size}`;
const emojiTag = (e: AppEmoji) => `<:${e.name}:${e.id}>`;
let emojiCache: { at: number; byName: Map<string, AppEmoji> } | null = null;
const EMOJI_TTL = 10 * 60 * 1000;
const MAX_NEW_EMOJIS_PER_CALL = 10;

async function listAppEmojis(appId: string, token: string) {
  if (emojiCache && Date.now() - emojiCache.at < EMOJI_TTL) return emojiCache.byName;
  const data = await discord<{ items?: AppEmoji[] }>(`/applications/${appId}/emojis`, token);
  const byName = new Map((data.items ?? []).map((e) => [e.name, e] as const));
  emojiCache = { at: Date.now(), byName };
  return byName;
}

async function uploadEmoji(appId: string, token: string, code: string, name: string): Promise<AppEmoji | null> {
  const image = await fetch(itemIconUrl(code, 64));
  if (!image.ok) return null;
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return discord<AppEmoji>(`/applications/${appId}/emojis`, token, { method: "POST", body: JSON.stringify({ name, image: `data:image/png;base64,${btoa(binary)}` }) });
}

/** Emojis (ícone) das armas do conteúdo. `upload` cria os que faltam; nas interações só lê (rápido). Nunca lança erro. */
export async function weaponEmojis(event: Row, cfg: DiscordConfig, upload: boolean): Promise<EmojiMap> {
  const out: EmojiMap = new Map();
  if (!cfg.appId || !cfg.botToken) return out;
  try {
    const codes = [...new Set(event.event_weapons.map((w) => w.icon_code).filter((c): c is string => !!c))];
    if (!codes.length) return out;
    const byName = await listAppEmojis(cfg.appId, cfg.botToken);
    let created = 0;
    for (const code of codes) {
      const name = emojiNameOf(code);
      let emoji = byName.get(name);
      if (!emoji && upload && created < MAX_NEW_EMOJIS_PER_CALL) {
        created++;
        try { emoji = (await uploadEmoji(cfg.appId, cfg.botToken, code, name)) ?? undefined; } catch (error) { console.error("[discord] emoji", code, error); }
        if (emoji) byName.set(name, emoji);
      }
      if (emoji) out.set(code, emoji);
    }
  } catch (error) { console.error("[discord] emojis", error); }
  return out;
}

/** Mensagem do canal: card do conteúdo + um botão por arma + botão que abre o site. */
export function buildMessage(event: Row, emojis: EmojiMap = new Map()) {
  const emojiOf = (w: { icon_code?: string | null }) => (w.icon_code ? emojis.get(w.icon_code) : undefined);
  const weapons = [...event.event_weapons].sort((a, b) => a.position - b.position);
  const total = event.signups.length;
  const full = total >= event.max_players;
  const unix = Math.floor(new Date(event.starts_at).getTime() / 1000);
  const info = [event.mode, event.content_type].filter(Boolean).join(" • ");

  const fields = [
    { name: "Quando", value: `<t:${unix}:F> (<t:${unix}:R>)`, inline: false },
    ...(event.caller_name ? [{ name: "Caller", value: clip(safeNick(event.caller_name), 100), inline: true }] : []),
    { name: "Jogadores", value: `${total} / ${event.max_players}${full ? " — lotado" : ""}`, inline: true },
    ...weapons.slice(0, 20).map((w) => {
      const nicks = event.signups.filter((s) => s.weapon_id === w.id).map((s) => safeNick(s.nick));
      const e = emojiOf(w);
      return { name: clip(`${e ? `${emojiTag(e)} ` : ""}${w.name} (${nicks.length}/${w.slots})`, 256), value: clip(nicks.join(", ") || "—", 1024), inline: true };
    }),
  ];
  const description = [info, event.description ? clip(event.description, 600) : ""].filter(Boolean).join("\n\n");

  const link = `${SHARE_ORIGIN}/evento/${event.id}`;
  // Limite do Discord: 25 botões (5 linhas x 5). Sobram 23 armas + "Sair" + "Abrir no site".
  const buttons: object[] = weapons.slice(0, 23).map((w) => {
    const left = w.slots - event.signups.filter((s) => s.weapon_id === w.id).length;
    const e = emojiOf(w);
    return { type: 2, style: left > 0 && !full ? 1 : 2, disabled: left <= 0 || full, custom_id: `p:${event.id}:${w.id}`, label: clip(`${w.name} (${Math.max(0, left)})`, 80), ...(e ? { emoji: { id: e.id, name: e.name } } : {}) };
  });
  buttons.push({ type: 2, style: 4, custom_id: `l:${event.id}`, label: "Sair" });
  buttons.push({ type: 2, style: 5, label: "Abrir no site", url: link });
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });

  return {
    embeds: [{
      title: clip(event.title, 256), url: link, color: COLOR, description: description || undefined, fields,
      thumbnail: { url: `${SHARE_ORIGIN}/logo-96.png` }, footer: { text: full ? "Conteúdo lotado" : "Clique na sua arma para pingar" },
    }],
    components: rows,
    // Nada de menções vindas de título/nick.
    allowed_mentions: { parse: [] as string[] },
  };
}

async function discord<T = { id: string; channel_id: string }>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" } });
  if (!response.ok) throw new Error(`Discord respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()) as T;
}

export async function sendEventMessage(event: Row, cfg: DiscordConfig, channelId = cfg.channelId) {
  if (!cfg.botToken || !channelId) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN / canal).");
  return discord(`/channels/${channelId}/messages`, cfg.botToken, { method: "POST", body: JSON.stringify(buildMessage(event, await weaponEmojis(event, cfg, true))) });
}

/** Nome e servidor de um canal (também confirma que o bot enxerga o canal). */
export async function getChannelInfo(channelId: string, cfg: DiscordConfig) {
  if (!cfg.botToken) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN).");
  return discord<{ id: string; name?: string; guild_id?: string }>(`/channels/${channelId}`, cfg.botToken);
}

/** Registra o comando /pingorax conectar (só quem gerencia o servidor vê/usa). */
export async function registerCommands(appId: string, cfg: DiscordConfig) {
  if (!cfg.botToken) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN).");
  await discord(`/applications/${appId}/commands`, cfg.botToken, { method: "PUT", body: JSON.stringify([{
    name: "pingorax", type: 1, description: "Conecta este canal ao PingoraX", default_member_permissions: "32", dm_permission: false,
    options: [{ type: 1, name: "conectar", description: "Gera um código para ligar este canal à sua conta do PingoraX" }],
  }]) });
}

// ---- Código de conexão: assinado (HMAC) com o token do bot, sem guardar nada no banco ----
const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sign(token: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`link|${message}`))).slice(0, 22);
}
const sameText = (a: string, b: string) => { let diff = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; };

export async function createLinkCode(token: string, guildId: string, channelId: string, ttlMs = 30 * 60 * 1000) {
  const body = `${guildId}.${channelId}.${Math.floor((Date.now() + ttlMs) / 1000).toString(36)}`;
  return `${body}.${await sign(token, body)}`;
}

export async function readLinkCode(token: string, raw: string): Promise<{ guildId: string; channelId: string } | "expired" | null> {
  const parts = raw.trim().split(".");
  if (parts.length !== 4) return null;
  const [guildId, channelId, exp, sig] = parts as [string, string, string, string];
  if (!/^[0-9]{5,25}$/.test(guildId) || !/^[0-9]{5,25}$/.test(channelId) || !/^[0-9a-z]{1,10}$/.test(exp)) return null;
  if (!sameText(sig, await sign(token, `${guildId}.${channelId}.${exp}`))) return null;
  return parseInt(exp, 36) * 1000 < Date.now() ? "expired" : { guildId, channelId };
}

export async function editEventMessage(event: Row, channelId: string, messageId: string, cfg: DiscordConfig) {
  if (!cfg.botToken) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN).");
  return discord(`/channels/${channelId}/messages/${messageId}`, cfg.botToken, { method: "PATCH", body: JSON.stringify(buildMessage(event, await weaponEmojis(event, cfg, true))) });
}

const hex = (value: string) => Uint8Array.from(value.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);

/** Confere a assinatura Ed25519 que o Discord manda em toda interação. */
export async function verifyDiscordRequest(publicKey: string, signature: string | null, timestamp: string | null, body: string) {
  if (!signature || !timestamp || !/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKey)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

type Interaction = {
  type: number;
  channel_id?: string; guild_id?: string;
  member?: { nick?: string | null; permissions?: string; user?: { id?: string; username?: string; global_name?: string | null } };
  data?: { name?: string; options?: { name: string }[]; custom_id?: string; components?: { components?: { custom_id?: string; value?: string }[] }[] };
  user?: { id?: string; username?: string; global_name?: string | null };
};

const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64 } });
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export async function handleInteraction(body: Interaction) {
  if (body.type === 1) return { type: 1 };

  // /pingorax conectar -> devolve o código de conexão (só para quem gerencia o servidor)
  if (body.type === 2) {
    if (body.data?.name !== "pingorax" || body.data.options?.[0]?.name !== "conectar") return ephemeral("Comando desconhecido.");
    if (!body.guild_id || !body.channel_id) return ephemeral("Use este comando dentro de um canal de servidor.");
    const perms = BigInt(body.member?.permissions ?? "0");
    if ((perms & (0x8n | 0x20n)) === 0n) return ephemeral("Só quem tem a permissão **Gerenciar Servidor** pode conectar um canal.");
    const token = discordConfig().botToken;
    if (!token) return ephemeral("O bot não está configurado no servidor do PingoraX.");
    const code = await createLinkCode(token, body.guild_id, body.channel_id);
    return ephemeral(`Código para conectar **este canal** (vale 30 minutos):\n\`\`\`${code}\`\`\`\nPasse para quem cria conteúdos: no PingoraX, em **Criar conteúdo → Discord**, cole o código e clique em Conectar.`);
  }

  const customId = body.data?.custom_id ?? "";
  const discordUserId = body.member?.user?.id ?? body.user?.id ?? "";

  // Clique em "Sair" -> remove o ping que esta pessoa fez pelo Discord
  if (body.type === 3 && customId.startsWith("l:")) {
    const match = customId.match(new RegExp(`^l:(${UUID})$`));
    if (!match) return ephemeral("Botão desconhecido.");
    if (!discordUserId) return ephemeral("Não consegui identificar você no Discord.");
    const { data, error } = await anonClient().rpc("discord_leave", { p_event: match[1]!, p_discord_user: discordUserId });
    if (error) { console.error("[discord] leave", error); return ephemeral("Não foi possível tirar seu ping agora. Tente de novo."); }
    if (!data) return ephemeral("Você não tem ping neste conteúdo pelo Discord. Se pingou pelo site, peça ao caller para remover.");
    const event = await loadEvent(match[1]!);
    if (!event) return ephemeral("Esse conteúdo não existe mais.");
    return { type: 7, data: buildMessage(event, await weaponEmojis(event, discordConfig(), false)) };
  }

  // Clique no botão da arma -> abre a janelinha pedindo o nick
  if (body.type === 3) {
    const match = customId.match(new RegExp(`^p:(${UUID}):(${UUID})$`));
    if (!match) return ephemeral("Botão desconhecido.");
    const who = body.member?.nick ?? body.member?.user?.global_name ?? body.member?.user?.username ?? body.user?.global_name ?? body.user?.username ?? "";
    return { type: 9, data: {
      custom_id: `n:${match[1]}:${match[2]}`, title: "Pingar no conteúdo",
      components: [{ type: 1, components: [{ type: 4, custom_id: "nick", label: "Seu nick no Albion", style: 1, min_length: 2, max_length: 32, required: true, ...(who ? { value: who.slice(0, 32) } : {}) }] }],
    } };
  }

  // Janelinha enviada -> registra o ping e atualiza a mensagem
  if (body.type === 5) {
    const match = customId.match(new RegExp(`^n:(${UUID}):(${UUID})$`));
    const nick = body.data?.components?.[0]?.components?.[0]?.value?.trim() ?? "";
    if (!match) return ephemeral("Pedido inválido.");
    if (nick.length < 2 || nick.length > 32) return ephemeral("O nick deve ter de 2 a 32 caracteres.");
    const [, eventId, weaponId] = match as unknown as [string, string, string];
    const { error } = await anonClient().rpc("discord_signup", { p_event: eventId, p_weapon: weaponId, p_nick: nick, p_discord_user: discordUserId });
    if (error) {
      if (error.code === "23505") return ephemeral(`O nick **${safeNick(nick)}** já pingou neste conteúdo.`);
      if (/lotado|esgotadas|inválid/i.test(error.message)) return ephemeral(`Não deu: ${error.message}.`);
      console.error("[discord] signup", error);
      return ephemeral("Não foi possível confirmar seu ping. Tente pelo site.");
    }
    const event = await loadEvent(eventId);
    if (!event) return ephemeral("Esse conteúdo não existe mais.");
    return { type: 7, data: buildMessage(event, await weaponEmojis(event, discordConfig(), false)) };
  }
  return ephemeral("Interação não suportada.");
}
