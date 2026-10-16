import { SHARE_ORIGIN } from "@/lib/share-image";
import { shortNumber, gameDate, type Server } from "@/lib/albion-types";
import { getBattle } from "@/lib/albion.server";
import { killDetail } from "@/lib/albion-kills.server";

const COLOR = 0x5fd0e8;
const SERVER_NAME: Record<Server, string> = { americas: "Américas", europe: "Europa", asia: "Ásia" };
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// Nomes de jogador/guilda nunca viram menção ou formatação no canal.
const safe = (text: string) => text.replace(/[\\*_`~|>@#<\[\]()]/g, "\\$&");

/** "T6_MAIN_CURSEDSTAFF@1" -> "6.1 Cursedstaff" (o nome em português depende do catálogo do site, que o bot não lê). */
export function prettyItem(code: string) {
  const match = code.match(/^T([1-8])_(.+?)(?:@([1-4]))?$/);
  if (!match) return code;
  const words = match[2]!.split("_").filter((w) => !["MAIN", "2H", "OFF", "HEAD", "ARMOR", "SHOES", "CAPE"].includes(w));
  const name = (words.length ? words : match[2]!.split("_")).map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
  return `${match[1]}${match[3] ? `.${match[3]}` : ""} ${name}`;
}
const tagOf = (side: { alliance: string; guild: string }) => [side.alliance && `[${safe(side.alliance)}]`, side.guild && safe(side.guild)].filter(Boolean).join(" ") || "sem guilda";

export type EmbedMessage = { embeds: object[]; allowed_mentions: { parse: string[] } };

/** Análise de uma batalha (placar por aliança/guilda e destaques), só com o que o jogo informa rápido. */
export async function battleMessage(server: Server, id: number): Promise<EmbedMessage> {
  const b = await getBattle(server, id);
  const unix = Math.floor(gameDate(b.startTime).getTime() / 1000);
  const title = (b.alliances.length ? b.alliances : b.guilds).slice(0, 4).map((g) => g.name).join(", ") || `Batalha #${b.id}`;
  return {
    embeds: [{
      title: clip(`Batalha #${b.id} — ${title}`, 256), url: `${SHARE_ORIGIN}/lutas?servidor=${server}&batalha=${b.id}`, color: COLOR,
      description: `**${b.players.length}** em campo · **${b.totalKills}** kills · **${shortNumber(b.totalFame)}** de fama\n<t:${unix}:F> (<t:${unix}:R>)`,
      image: { url: `${SHARE_ORIGIN}/api/public/battle-image?s=${server}&id=${b.id}&v=${Math.floor(Date.now() / 60000)}` },
      footer: { text: `${SERVER_NAME[server]} · análise completa no site` },
    }],
    allowed_mentions: { parse: [] },
  };
}

const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;

/** Uma kill no estilo dos killboards do Discord: quem matou quem, participantes, guilda, IP, fama e equipamento. */
export async function killMessage(server: Server, id: number): Promise<EmbedMessage> {
  const k = await killDetail(server, id);
  const unix = Math.floor(gameDate(k.time).getTime() / 1000);
  const link = (name: string, playerId?: string) => (playerId ? `[${safe(name)}](${SHARE_ORIGIN}/kills?servidor=${server}&jogador=${encodeURIComponent(playerId)})` : safe(name));
  const side = (s: typeof k.killer, extra = "") =>
    `**${link(s.name, s.id)}**\nGuilda: ${code(`${s.alliance ? `[${s.alliance}]` : ""}${s.guild || "sem guilda"}`)}\nIP: ${code(String(s.ip || "?"))}${extra}`;
  const helpers = k.participants.filter((p) => p.name !== k.killer.name).slice(0, 8).map((p) => link(p.name, p.id)).join(", ");
  const description = [
    helpers ? `Participantes: ${helpers}${k.assists > helpers.split(", ").length ? ` e mais ${k.assists - helpers.split(", ").length}` : ""}` : "",
    "",
    side(k.killer),
    "──────────⚔️──────────",
    side(k.victim, `\nFama: ${code(k.fame.toLocaleString("en-US"))}`),
  ].join("\n");
  return {
    embeds: [{
      title: clip(`${k.killer.name} matou ${k.victim.name}`, 256), url: `${SHARE_ORIGIN}/kills?servidor=${server}&kill=${k.id}`, color: 0x22c55e,
      description: clip(description, 4000),
      image: { url: `${SHARE_ORIGIN}/api/public/kill-image?s=${server}&id=${k.id}` },
      footer: { text: SERVER_NAME[server] },
      timestamp: new Date(unix * 1000).toISOString(),
    }],
    allowed_mentions: { parse: [] },
  };
}

/** Pega o número da batalha/kill de um número solto ou de um link. */
export function parseId(raw: string): number | null {
  const match = raw.match(/\d{3,}/g);
  const id = match ? Number(match[match.length - 1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
