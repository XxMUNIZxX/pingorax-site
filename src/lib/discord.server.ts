import { publicShareClient } from "@/lib/share-image.server";
import { SHARE_ORIGIN } from "@/lib/share-image";

const API = "https://discord.com/api/v10";
const COLOR = 0x5fd0e8;

type Row = {
  id: string; title: string; description: string | null; starts_at: string; max_players: number;
  mode: string | null; caller_name: string | null; content_type: string | null;
  event_weapons: { id: string; name: string; slots: number; position: number }[];
  signups: { id: string; nick: string; weapon_id: string; created_at: string }[];
};

export type DiscordConfig = { publicKey?: string | undefined; botToken?: string | undefined; channelId?: string | undefined };
// Colar a chave com espaço/quebra de linha no fim é comum: limpa antes de usar.
const env = (name: string) => process.env[name]?.trim() || undefined;
export const discordConfig = (): DiscordConfig => ({
  publicKey: env("DISCORD_PUBLIC_KEY")?.toLowerCase(), botToken: env("DISCORD_BOT_TOKEN"), channelId: env("DISCORD_CHANNEL_ID"),
});

export function anonClient() {
  const url = process.env["SUPABASE_URL"]; const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Servidor sem SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.");
  return publicShareClient(url, key);
}

export async function loadEvent(id: string): Promise<Row | null> {
  const { data, error } = await anonClient().from("events")
    .select("id,title,description,starts_at,max_players,mode,caller_name,content_type,event_weapons(id,name,slots,position),signups(id,nick,weapon_id,created_at)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Row | null) ?? null;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// Evita que um nick com @everyone, markdown ou link vire menção/formatação no canal.
const safeNick = (nick: string) => nick.replace(/[\\*_`~|>@#<\[\]()]/g, "\\$&");

/** Mensagem do canal: card do conteúdo + um botão por arma + botão que abre o site. */
export function buildMessage(event: Row) {
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
      return { name: clip(`${w.name} (${nicks.length}/${w.slots})`, 256), value: clip(nicks.join(", ") || "—", 1024), inline: true };
    }),
  ];
  const description = [info, event.description ? clip(event.description, 600) : ""].filter(Boolean).join("\n\n");

  const link = `${SHARE_ORIGIN}/evento/${event.id}`;
  const buttons: object[] = weapons.slice(0, 24).map((w) => {
    const left = w.slots - event.signups.filter((s) => s.weapon_id === w.id).length;
    return { type: 2, style: left > 0 && !full ? 1 : 2, disabled: left <= 0 || full, custom_id: `p:${event.id}:${w.id}`, label: clip(`${w.name} (${Math.max(0, left)})`, 80) };
  });
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

async function discord(path: string, token: string, init: RequestInit) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" } });
  if (!response.ok) throw new Error(`Discord respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()) as { id: string; channel_id: string };
}

export async function sendEventMessage(event: Row, cfg: DiscordConfig) {
  if (!cfg.botToken || !cfg.channelId) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID).");
  return discord(`/channels/${cfg.channelId}/messages`, cfg.botToken, { method: "POST", body: JSON.stringify(buildMessage(event)) });
}

export async function editEventMessage(event: Row, channelId: string, messageId: string, cfg: DiscordConfig) {
  if (!cfg.botToken) throw new Error("Discord não configurado (DISCORD_BOT_TOKEN).");
  return discord(`/channels/${channelId}/messages/${messageId}`, cfg.botToken, { method: "PATCH", body: JSON.stringify(buildMessage(event)) });
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
  data?: { custom_id?: string; components?: { components?: { custom_id?: string; value?: string }[] }[] };
  member?: { nick?: string | null; user?: { username?: string; global_name?: string | null } };
  user?: { username?: string; global_name?: string | null };
};

const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64 } });
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export async function handleInteraction(body: Interaction) {
  if (body.type === 1) return { type: 1 };

  const customId = body.data?.custom_id ?? "";
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
    const { error } = await anonClient().from("signups").insert({ event_id: eventId, weapon_id: weaponId, nick });
    if (error) {
      if (error.code === "23505") return ephemeral(`O nick **${safeNick(nick)}** já pingou neste conteúdo.`);
      if (/lotado|esgotadas|inválid/i.test(error.message)) return ephemeral(`Não deu: ${error.message}.`);
      console.error("[discord] signup", error);
      return ephemeral("Não foi possível confirmar seu ping. Tente pelo site.");
    }
    const event = await loadEvent(eventId);
    if (!event) return ephemeral("Esse conteúdo não existe mais.");
    return { type: 7, data: buildMessage(event) };
  }
  return ephemeral("Interação não suportada.");
}
