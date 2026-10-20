import { publicShareClient } from "@/lib/share-image.server";
import { SHARE_ORIGIN } from "@/lib/share-image";
import { serverEnv } from "@/lib/server-env";
import type { Server } from "@/lib/albion-types";
import { isMissingRoleColumn, roleLabel } from "@/lib/weapon-roles";

const API = "https://discord.com/api/v10";
const COLOR = 0x5fd0e8;

type Row = {
  id: string; title: string; description: string | null; starts_at: string; max_players: number;
  mode: string | null; caller_name: string | null; content_type: string | null;
  event_weapons: { id: string; name: string; slots: number; position: number; icon_code?: string | null; icon_path?: string | null; role?: string | null }[];
  signups: { id: string; nick: string; weapon_id: string; created_at: string }[];
  waitlist?: { nick: string; weapon_id: string }[];
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
  const query = (cols: string) => anonClient().from("events")
    .select(`id,title,description,starts_at,max_players,mode,caller_name,content_type,event_weapons(${cols}),signups(id,nick,weapon_id,created_at)`)
    .eq("id", id).maybeSingle();
  let { data, error } = await query("id,name,slots,position,icon_code,icon_path,role");
  // Migração 0009 (coluna role) ainda não rodada: segue sem a função, para o bot continuar funcionando.
  if (isMissingRoleColumn(error)) ({ data, error } = await query("id,name,slots,position,icon_code,icon_path"));
  if (error) throw error;
  const row = (data as unknown as Row | null) ?? null;
  if (row) {
    // Fila de espera (migração 0011): se a tabela ainda não existe, o card só não mostra a fila.
    const queue = await anonClient().from("waitlist").select("nick,weapon_id").eq("event_id", id).order("created_at");
    if (!queue.error) row.waitlist = queue.data ?? [];
  }
  return row;
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
const MAX_NEW_EMOJIS_PER_CALL = 15;

async function listAppEmojis(appId: string, token: string, fresh = false) {
  if (!fresh && emojiCache && Date.now() - emojiCache.at < EMOJI_TTL) return emojiCache.byName;
  const data = await discord<{ items?: AppEmoji[] }>(`/applications/${appId}/emojis`, token);
  const byName = new Map((data.items ?? []).map((e) => [e.name, e] as const));
  emojiCache = { at: Date.now(), byName };
  return byName;
}

function toDataUrl(bytes: Uint8Array) {
  let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}
async function postEmoji(appId: string, token: string, name: string, bytes: Uint8Array): Promise<AppEmoji> {
  return discord<AppEmoji>(`/applications/${appId}/emojis`, token, { method: "POST", body: JSON.stringify({ name, image: toDataUrl(bytes) }) });
}
async function uploadEmoji(appId: string, token: string, code: string, name: string): Promise<AppEmoji | null> {
  const image = await fetch(itemIconUrl(code, 64));
  if (!image.ok) return null;
  return postEmoji(appId, token, name, new Uint8Array(await image.arrayBuffer()));
}

/** Reduz um PNG para caber num emoji (o Discord aceita até 256 KB; 128 px é o tamanho recomendado). */
async function shrinkPng(bytes: Uint8Array, size = 128): Promise<Uint8Array> {
  const { decodePng, encodePng } = await import("@/lib/kill-image.server");
  const img = await decodePng(bytes);
  if (img.w <= size && img.h <= size && bytes.length <= 256 * 1024) return bytes;
  const scale = Math.min(1, size / Math.max(img.w, img.h));
  const w = Math.max(1, Math.round(img.w * scale)), h = Math.max(1, Math.round(img.h * scale));
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Média da área de origem (com alfa), para a imagem não ficar serrilhada.
    const x0 = Math.floor((x * img.w) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.w) / w));
    const y0 = Math.floor((y * img.h) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.h) / h));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) { const o = (j * img.w + i) * 4, al = img.px[o + 3]!; r += img.px[o]! * al; g += img.px[o + 1]! * al; b += img.px[o + 2]! * al; a += al; n++; }
    const d = (y * w + x) * 4;
    if (a > 0) { px[d] = r / a; px[d + 1] = g / a; px[d + 2] = b / a; }
    px[d + 3] = a / n;
  }
  return encodePng({ w, h, px });
}

type IconSource = { key: string; name: string; load: () => Promise<Uint8Array | null> };
/** De onde vem o ícone de uma arma: imagem enviada pelo criador (storage) ou item do catálogo do Albion. */
function iconSourceOf(w: { icon_code?: string | null; icon_path?: string | null }): IconSource | null {
  if (w.icon_path) {
    const path = w.icon_path;
    const id = (path.split("/").pop() ?? path).replace(/\.png$/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 29);
    return { key: `path:${path}`, name: `wc_${id}`, load: async () => {
      const { data, error } = await anonClient().storage.from("weapon-icons").download(path);
      if (error || !data) { console.error("[discord] ícone enviado", path, error?.message); return null; }
      return shrinkPng(new Uint8Array(await data.arrayBuffer()));
    } };
  }
  if (w.icon_code) {
    const code = w.icon_code;
    return { key: code, name: emojiNameOf(code), load: async () => { const r = await fetch(itemIconUrl(code, 64)); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } };
  }
  return null;
}

/** Emojis (ícone) das armas do conteúdo. `upload` cria os que faltam; nas interações só lê (rápido). Nunca lança erro. */
export async function weaponEmojis(event: Row, cfg: DiscordConfig, upload: boolean): Promise<EmojiMap> {
  const out: EmojiMap = new Map();
  if (!cfg.appId || !cfg.botToken) return out;
  try {
    const sources = new Map<string, IconSource>();
    for (const w of event.event_weapons) { const src = iconSourceOf(w); if (src) sources.set(src.key, src); }
    if (!sources.size) return out;
    const byName = await listAppEmojis(cfg.appId, cfg.botToken);
    let created = 0;
    for (const src of sources.values()) {
      let emoji = byName.get(src.name);
      if (!emoji && upload && created < MAX_NEW_EMOJIS_PER_CALL) {
        created++;
        try {
          const bytes = await src.load();
          if (bytes) emoji = await postEmoji(cfg.appId, cfg.botToken, src.name, bytes);
        } catch (error) { console.error("[discord] emoji", src.key, error); }
        if (emoji) byName.set(src.name, emoji);
      }
      if (emoji) out.set(src.key, emoji);
    }
  } catch (error) { console.error("[discord] emojis", error); }
  return out;
}

/** Mensagem do canal: card do conteúdo + um botão por arma + botão que abre o site. */
export function buildMessage(event: Row, emojis: EmojiMap = new Map()) {
  const emojiOf = (w: { icon_code?: string | null; icon_path?: string | null }) => { const key = iconSourceOf(w)?.key; return key ? emojis.get(key) : undefined; };
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
      return { name: clip(`${e ? `${emojiTag(e)} ` : ""}${w.name}${roleLabel(w.role) ? ` · ${roleLabel(w.role)}` : ""} (${nicks.length}/${w.slots})`, 256), value: clip(nicks.join(", ") || "—", 1024), inline: true };
    }),
    ...(event.waitlist?.length ? [{
      name: `Fila de espera (${event.waitlist.length})`,
      value: clip(`${event.waitlist.slice(0, 10).map((q, i) => `${i + 1}. ${safeNick(q.nick)}`).join("\n")}${event.waitlist.length > 10 ? `\n+${event.waitlist.length - 10}…` : ""}`, 1024),
      inline: false,
    }] : []),
  ];
  const description = [info, event.description ? clip(event.description, 600) : ""].filter(Boolean).join("\n\n");

  const link = `${SHARE_ORIGIN}/evento/${event.id}`;
  // Limite do Discord: 25 botões (5 linhas x 5). Sobram 22 armas + "Sair" + "Abrir no site" + "Remover".
  const buttons: object[] = weapons.slice(0, 22).map((w) => {
    const left = w.slots - event.signups.filter((s) => s.weapon_id === w.id).length;
    const e = emojiOf(w);
    return { type: 2, style: left > 0 && !full ? 1 : 2, disabled: left <= 0 || full, custom_id: `p:${event.id}:${w.id}`, label: clip(`${w.name} (${Math.max(0, left)})`, 80), ...(e ? { emoji: { id: e.id, name: e.name } } : {}) };
  });
  buttons.push({ type: 2, style: 4, custom_id: `l:${event.id}`, label: "Sair" });
  buttons.push({ type: 2, style: 5, label: "Abrir no site", url: link });
  buttons.push({ type: 2, style: 2, custom_id: `x:${event.id}`, label: "Remover mensagem" });
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

/** Envia uma mensagem pronta (embeds) a um canal. */
export async function sendRawMessage(channelId: string, cfg: DiscordConfig, payload: object) {
  if (!cfg.botToken || !channelId) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN / canal).");
  return discord(`/channels/${channelId}/messages`, cfg.botToken, { method: "POST", body: JSON.stringify(payload) });
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

/** Registra os comandos: /pingorax conectar e /conteudo remover (só quem gerencia), e /luta, /kill, /build (qualquer pessoa). */
export async function registerCommands(appId: string, cfg: DiscordConfig) {
  if (!cfg.botToken) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN).");
  const idOption = (what: string) => ({ type: 3, name: "id", description: `Número ou link ${what}`, required: true, max_length: 200 });
  const serverOption = { type: 3, name: "servidor", description: "Servidor do Albion (padrão: Américas)", required: false,
    choices: [{ name: "Américas", value: "americas" }, { name: "Europa", value: "europe" }, { name: "Ásia", value: "asia" }] };
  await discord(`/applications/${appId}/commands`, cfg.botToken, { method: "PUT", body: JSON.stringify([
    { name: "pingorax", type: 1, description: "Conecta este canal ao PingoraX", default_member_permissions: "32", dm_permission: false,
      options: [{ type: 1, name: "conectar", description: "Gera um código para ligar este canal à sua conta do PingoraX" }] },
    { name: "conteudo", type: 1, description: "Gerencia as mensagens de conteúdo deste servidor", default_member_permissions: "8192", dm_permission: false,
      options: [{ type: 1, name: "remover", description: "Tira do canal a mensagem de um conteúdo",
        options: [{ type: 3, name: "conteudo", description: "Escolha o conteúdo (ou \"todos\" para limpar os que já passaram)", required: true, autocomplete: true, max_length: 100 }] }] },
    { name: "luta", type: 1, description: "Mostra a análise de uma batalha do Albion", options: [idOption("da batalha"), serverOption] },
    { name: "kill", type: 1, description: "Mostra uma kill do Albion", options: [idOption("da kill"), serverOption] },
    { name: "build", type: 1, description: "Mostra a imagem de uma build ou de um grupo de builds do PingoraX",
      options: [{ type: 3, name: "nome", description: "Comece a digitar o nome da build ou do grupo", required: true, autocomplete: true, max_length: 100 }] },
  ]) });
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

// ---- Limpeza: tirar do canal a mensagem de um conteúdo que já passou ----
/** Minutos depois do horário do conteúdo em que a mensagem sai sozinha do canal. */
export const CLEANUP_GRACE_MINUTES = 60;
const CLEANUP_WINDOW_HOURS = 24;
const CLEANUP_MAX_PER_RUN = 40;
let lastMaintenance = 0;
export const REMINDER_MINUTES = 20;

/** Apaga a mensagem no Discord. `true` se apagou ou se ela já não existia; lança erro nos demais casos (ex.: sem permissão). */
export async function deleteDiscordMessage(channelId: string, messageId: string, cfg: DiscordConfig): Promise<boolean> {
  if (!cfg.botToken) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN).");
  const response = await fetch(`${API}/channels/${channelId}/messages/${messageId}`, { method: "DELETE", headers: { Authorization: `Bot ${cfg.botToken}` } });
  if (response.ok || response.status === 404) return true;
  throw new Error(`Discord respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

/** Quem pode remover mensagens pelo Discord: Administrador, Gerenciar Servidor ou Gerenciar Mensagens. */
export function canManageMessages(permissions?: string): boolean {
  try { return (BigInt(permissions ?? "0") & (0x8n | 0x20n | 0x2000n)) !== 0n; } catch { return false; }
}

/** Intervalo (em ISO) dos conteúdos cuja mensagem deve sair agora: começaram há mais de `grace` minutos e há menos de 24 h. */
export function cleanupRange(now: number, graceMinutes = CLEANUP_GRACE_MINUTES) {
  return {
    newest: new Date(now - graceMinutes * 60_000).toISOString(),
    oldest: new Date(now - (graceMinutes + CLEANUP_WINDOW_HOURS * 60) * 60_000).toISOString(),
  };
}

/** Remove do canal as mensagens dos conteúdos que já passaram. Seguro de chamar várias vezes (apagar o que já sumiu não faz mal). */
export async function cleanupExpiredPosts(cfg: DiscordConfig, now = Date.now()): Promise<{ checked: number; removed: number; failed: number; skipped?: true }> {
  if (!cfg.botToken) return { checked: 0, removed: 0, failed: 0, skipped: true };
  const grace = Number(serverEnv("DISCORD_CLEANUP_MINUTES"));
  const { newest, oldest } = cleanupRange(now, Number.isFinite(grace) && grace >= 0 && serverEnv("DISCORD_CLEANUP_MINUTES") ? grace : CLEANUP_GRACE_MINUTES);
  const { data, error } = await anonClient().from("discord_posts")
    .select("event_id,channel_id,message_id,events!inner(starts_at)")
    .lt("events.starts_at", newest).gt("events.starts_at", oldest)
    .order("created_at", { ascending: false }).limit(CLEANUP_MAX_PER_RUN);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { event_id: string; channel_id: string; message_id: string }[];
  let removed = 0; let failed = 0;
  for (const row of rows) {
    try { await deleteDiscordMessage(row.channel_id, row.message_id, cfg); removed++; }
    catch (err) { failed++; console.error("[discord] limpeza", row.event_id, err); }
  }
  return { checked: rows.length, removed, failed };
}

// ---- Lembrete: avisa no canal quando o conteúdo está perto de começar ----
/** Texto do lembrete (puro, para teste). */
export function reminderText(event: Row): string {
  const unix = Math.floor(new Date(event.starts_at).getTime() / 1000);
  const total = event.signups.length;
  const free = Math.max(0, event.max_players - total);
  const nicks = event.signups.map((s) => safeNick(s.nick));
  return [
    `⏰ **${clip(safeNick(event.title), 150)}** começa <t:${unix}:R>!`,
    `${total}/${event.max_players} jogadores${free ? ` — ainda tem ${free} ${free === 1 ? "vaga" : "vagas"}, corre pingar.` : " — lotado."}`,
    nicks.length ? `Confirmados: ${clip(nicks.join(", "), 1200)}` : "",
    `${SHARE_ORIGIN}/evento/${event.id}`,
  ].filter(Boolean).join("\n");
}

/** Manda o lembrete dos conteúdos que começam em breve (uma vez por conteúdo). Sem a migração 0010 não faz nada. */
export async function sendReminders(cfg: DiscordConfig, now = Date.now()): Promise<{ sent: number; failed: number; skipped?: true }> {
  if (!cfg.botToken) return { sent: 0, failed: 0, skipped: true };
  const lead = Number(serverEnv("DISCORD_REMINDER_MINUTES"));
  const minutes = serverEnv("DISCORD_REMINDER_MINUTES") && Number.isFinite(lead) && lead > 0 ? Math.min(lead, 30) : REMINDER_MINUTES;
  const { data, error } = await anonClient().from("discord_posts")
    .select("event_id,channel_id,message_id,events!inner(starts_at)").is("reminded_at", null)
    .gt("events.starts_at", new Date(now).toISOString()).lte("events.starts_at", new Date(now + minutes * 60_000).toISOString()).limit(20);
  if (error) {
    if (/reminded_at/.test(`${error.message} ${error.details ?? ""}`)) return { sent: 0, failed: 0, skipped: true };
    throw error;
  }
  let sent = 0; let failed = 0;
  for (const row of (data ?? []) as unknown as { event_id: string; channel_id: string; message_id: string }[]) {
    try {
      const { data: claimed, error: claimError } = await anonClient().rpc("discord_claim_reminder", { p_event: row.event_id });
      if (claimError) throw claimError;
      if (!claimed) continue;
      const event = await loadEvent(row.event_id);
      if (!event) continue;
      await sendRawMessage(row.channel_id, cfg, {
        content: reminderText(event),
        message_reference: { message_id: row.message_id, fail_if_not_exists: false },
        allowed_mentions: { parse: [] as string[] },
      });
      sent++;
    } catch (err) { failed++; console.error("[discord] lembrete", row.event_id, err); }
  }
  return { sent, failed };
}

/** Tarefas periódicas do bot (cron e reforço a cada interação): limpa o que passou e manda lembretes. No máximo 1x por minuto. */
export async function discordMaintenance(cfg: DiscordConfig, now = Date.now()) {
  if (now - lastMaintenance < 60_000) return { skipped: true as const };
  lastMaintenance = now;
  const result: { cleanup?: Awaited<ReturnType<typeof cleanupExpiredPosts>>; reminders?: Awaited<ReturnType<typeof sendReminders>>; errors: string[] } = { errors: [] };
  const { alertError } = await import("@/lib/alerts.server");
  try { result.cleanup = await cleanupExpiredPosts(cfg, now); } catch (error) { result.errors.push("limpeza"); console.error("[discord] limpeza", error); await alertError("Limpeza de mensagens falhou", error, now); }
  try { result.reminders = await sendReminders(cfg, now); } catch (error) { result.errors.push("lembretes"); console.error("[discord] lembretes", error); await alertError("Lembretes falharam", error, now); }
  if ((result.cleanup?.failed ?? 0) > 0) await alertError("Não consegui apagar mensagens", `${result.cleanup!.failed} mensagem(ns) não foram apagadas. Confira se o bot tem a permissão Gerenciar Mensagens nos canais.`, now);
  if ((result.reminders?.failed ?? 0) > 0) await alertError("Não consegui enviar lembretes", `${result.reminders!.failed} lembrete(s) falharam. Confira se o bot ainda enxerga o canal.`, now);
  return result;
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

type Opt = { name: string; value?: string | number; focused?: boolean; options?: Opt[] };
type Interaction = {
  type: number;
  channel_id?: string; guild_id?: string;
  member?: { nick?: string | null; permissions?: string; user?: { id?: string; username?: string; global_name?: string | null } };
  token?: string; application_id?: string; message?: { id?: string; channel_id?: string };
  data?: { name?: string; options?: Opt[]; custom_id?: string; components?: { components?: { custom_id?: string; value?: string }[] }[] };
  user?: { id?: string; username?: string; global_name?: string | null };
};

const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64 } });
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Deixa o Worker terminar um trabalho depois de responder ao Discord (se o ambiente permitir). */
async function runLater(task: Promise<unknown>): Promise<boolean> {
  try {
    const specifier = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ specifier)) as { waitUntil?: (promise: Promise<unknown>) => void };
    if (typeof mod.waitUntil !== "function") return false;
    mod.waitUntil(task);
    return true;
  } catch { return false; }
}

/** /luta e /kill: respondem com um cartão de análise no canal onde o comando foi usado. */
async function analysisCommand(body: Interaction, kind: "luta" | "kill") {
  const { battleMessage, killMessage, parseId } = await import("@/lib/albion-discord.server");
  const options = body.data?.options ?? [];
  const id = parseId(String(options.find((o) => o.name === "id")?.value ?? ""));
  const rawServer = String(options.find((o) => o.name === "servidor")?.value ?? "americas");
  const server: Server = rawServer === "europe" || rawServer === "asia" ? rawServer : "americas";
  if (!id) return ephemeral("Não achei o número. Use o número ou o link da " + (kind === "luta" ? "batalha." : "kill."));
  const build = () => (kind === "luta" ? battleMessage(server, id) : killMessage(server, id));

  // O Discord só espera 3 s. Com o Worker podendo continuar em segundo plano, respondemos "pensando" e editamos depois.
  const appId = body.application_id ?? serverEnv("DISCORD_APP_ID");
  if (body.token && appId) {
    const deliver = async () => {
      let payload: object;
      try { payload = await build(); }
      catch (error) { console.error("[discord] analise", error); payload = { content: kind === "luta" ? "Não consegui carregar essa batalha agora. Confira o número e o servidor." : "Não consegui carregar essa kill agora. Confira o número e o servidor." }; }
      await fetch(`${API}/webhooks/${appId}/${body.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    };
    if (await runLater(deliver())) return { type: 5 };
  }
  // Sem segundo plano: tenta dentro do prazo.
  try {
    const message = await Promise.race([build(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))]);
    if (!message) return ephemeral("A API do Albion demorou para responder. Tente o comando de novo em alguns segundos.");
    return { type: 4, data: message };
  } catch (error) {
    console.error("[discord] analise", error);
    return ephemeral("Não consegui carregar isso agora. Confira o número e o servidor.");
  }
}

/** /build: mostra a imagem de uma build ou de um grupo (o nome vem do autocomplete ou digitado). */
async function buildCommand(body: Interaction) {
  const raw = String(body.data?.options?.find((o) => o.name === "nome")?.value ?? "").trim();
  if (!raw) return ephemeral("Digite o nome da build ou do grupo.");
  try {
    const { resolveRef, buildMessage } = await import("@/lib/build-discord.server");
    const run = async () => { const ref = await resolveRef(raw); return ref ? buildMessage(ref) : null; };
    const message = await Promise.race([run(), new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2500))]);
    if (message === undefined) return ephemeral("O banco demorou para responder. Tente o comando de novo.");
    if (!message) return ephemeral("Não achei essa build. Comece a digitar o nome e escolha uma das opções da lista.");
    return { type: 4, data: message };
  } catch (error) {
    console.error("[discord] build", error);
    return ephemeral("Não consegui carregar essa build agora. Tente de novo em instantes.");
  }
}

const NO_PERMISSION = "Só quem tem **Gerenciar Mensagens** (ou Gerenciar Servidor) pode remover mensagens de conteúdo.";
const whenText = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type PostRow = { event_id: string; channel_id: string; message_id: string; events: { title: string; starts_at: string } | null };
async function postsInChannel(channelId: string, onlyPast: boolean, limit: number): Promise<PostRow[]> {
  let query = anonClient().from("discord_posts").select("event_id,channel_id,message_id,events!inner(title,starts_at)").eq("channel_id", channelId);
  if (onlyPast) query = query.lt("events.starts_at", new Date().toISOString());
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PostRow[];
}

/** Autocomplete de /conteudo remover: os conteúdos postados neste canal. */
async function removeChoices(body: Interaction) {
  const typed = String(body.data?.options?.[0]?.options?.find((o) => o.focused)?.value ?? "").toLowerCase();
  const choices: { name: string; value: string }[] = [{ name: "Todos os que já passaram (neste canal)", value: "todos" }];
  if (body.channel_id && canManageMessages(body.member?.permissions)) {
    for (const post of await postsInChannel(body.channel_id, false, 24)) {
      const title = post.events?.title ?? "Conteúdo";
      if (typed && !title.toLowerCase().includes(typed)) continue;
      choices.push({ name: clip(`${title} — ${post.events ? whenText(post.events.starts_at) : ""}`, 100), value: post.event_id });
    }
  }
  return { type: 8, data: { choices: choices.slice(0, 25) } };
}

/** /conteudo remover: apaga a mensagem de um conteúdo (ou de todos os que já passaram) deste canal. */
async function removeCommand(body: Interaction) {
  if (!body.channel_id) return ephemeral("Use este comando dentro de um canal de servidor.");
  if (!canManageMessages(body.member?.permissions)) return ephemeral(NO_PERMISSION);
  const cfg = discordConfig();
  if (!cfg.botToken) return ephemeral("O bot não está configurado no servidor do PingoraX.");
  const choice = String(body.data?.options?.[0]?.options?.find((o) => o.name === "conteudo")?.value ?? "").trim();
  try {
    if (choice === "todos") {
      const past = await postsInChannel(body.channel_id, true, 50);
      let removed = 0;
      for (const post of past) { try { await deleteDiscordMessage(post.channel_id, post.message_id, cfg); removed++; } catch (error) { console.error("[discord] remover", error); } }
      return ephemeral(removed ? `Removi ${removed} mensagem(ns) de conteúdos que já passaram.` : "Não há mensagens de conteúdos passados neste canal.");
    }
    if (!new RegExp(`^${UUID}$`).test(choice)) return ephemeral("Escolha um conteúdo da lista que aparece enquanto você digita.");
    const post = (await postsInChannel(body.channel_id, false, 100)).find((row) => row.event_id === choice);
    if (!post) return ephemeral("Não achei a mensagem desse conteúdo neste canal. Ela pode já ter sido removida.");
    await deleteDiscordMessage(post.channel_id, post.message_id, cfg);
    return ephemeral(`Mensagem de **${clip(post.events?.title ?? "conteúdo", 80)}** removida do canal.`);
  } catch (error) {
    console.error("[discord] remover", error);
    return ephemeral("Não consegui remover. Confira se o bot tem a permissão **Gerenciar Mensagens** neste canal.");
  }
}

export async function handleInteraction(body: Interaction) {
  if (body.type === 1) return { type: 1 };
  // Aproveita cada interação para limpar conteúdos vencidos e mandar lembretes (reforço do agendamento; no máximo 1x por minuto).
  void runLater(discordMaintenance(discordConfig()));

  // Autocomplete do /build (type 4): devolve até 25 nomes.
  if (body.type === 4 && body.data?.name === "build") {
    try {
      const { searchBuilds } = await import("@/lib/build-discord.server");
      const typed = String(body.data.options?.find((o) => o.focused)?.value ?? "");
      return { type: 8, data: { choices: await searchBuilds(typed) } };
    } catch (error) { console.error("[discord] autocomplete", error); return { type: 8, data: { choices: [] } }; }
  }
  if (body.type === 4 && body.data?.name === "conteudo") {
    try { return await removeChoices(body); }
    catch (error) { console.error("[discord] autocomplete conteudo", error); return { type: 8, data: { choices: [] } }; }
  }
  if (body.type === 2 && body.data?.name === "build") return buildCommand(body);
  if (body.type === 2 && body.data?.name === "conteudo" && body.data.options?.[0]?.name === "remover") return removeCommand(body);

  if (body.type === 2 && (body.data?.name === "luta" || body.data?.name === "kill")) return analysisCommand(body, body.data.name);

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

  // Clique em "Remover mensagem" -> apaga o card do canal (só quem gerencia mensagens)
  if (body.type === 3 && customId.startsWith("x:")) {
    if (!canManageMessages(body.member?.permissions)) return ephemeral(NO_PERMISSION);
    const channelId = body.message?.channel_id ?? body.channel_id; const messageId = body.message?.id;
    const cfg = discordConfig();
    if (!channelId || !messageId || !cfg.botToken) return ephemeral("Não consegui identificar a mensagem.");
    try { await deleteDiscordMessage(channelId, messageId, cfg); }
    catch (error) { console.error("[discord] remover botão", error); return ephemeral("Não consegui remover. Confira se o bot tem a permissão **Gerenciar Mensagens** neste canal."); }
    return ephemeral("Mensagem removida do canal.");
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

/** Cria (em lotes) o emoji de todas as armas do catálogo. Chame de novo até `remaining` chegar a 0. */
export async function syncCatalogEmojis(cfg: DiscordConfig, batch = 15) {
  if (!cfg.appId || !cfg.botToken) throw new Error("Faltam DISCORD_APP_ID e DISCORD_BOT_TOKEN no Worker.");
  const { data, error } = await anonClient().from("weapon_catalog").select("item_code");
  if (error) throw error;
  const codes = [...new Set((data ?? []).map((row) => row.item_code).filter(Boolean))];
  const byName = await listAppEmojis(cfg.appId, cfg.botToken, true);
  const missing = codes.filter((code) => !byName.has(emojiNameOf(code)));
  let created = 0; let failed = 0; let rateLimited = false;
  for (const code of missing.slice(0, batch)) {
    try {
      const emoji = await uploadEmoji(cfg.appId, cfg.botToken, code, emojiNameOf(code));
      if (emoji) { byName.set(emoji.name, emoji); created++; } else failed++;
    } catch (error) {
      console.error("[discord] emoji sync", code, error);
      if (/ 429/.test(String(error))) { rateLimited = true; break; }
      failed++;
    }
  }
  return { total: codes.length, created, failed, rateLimited, remaining: Math.max(0, missing.length - created - failed) };
}
