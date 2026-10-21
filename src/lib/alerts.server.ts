import { serverEnv } from "@/lib/server-env";

const WEBHOOK = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,}$/;
const THROTTLE_MS = 30 * 60 * 1000;
const lastSent = new Map<string, number>();

/** Tira do texto qualquer coisa que pareça token/segredo antes de ir para o canal de avisos. */
export function redact(text: string): string {
  return text
    .replace(/https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\S+/g, "[webhook]")
    .replace(/[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}/g, "[token]")
    .replace(/\b(?:sb_secret_|sb_publishable_|eyJ)[\w.-]{10,}/g, "[chave]");
}

export function alertText(where: string, error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? "erro desconhecido");
  return `⚠️ **PingoraX — ${where}**\n\`\`\`${redact(message).replace(/```/g, "'''").slice(0, 1500)}\`\`\``;
}

/** Um aviso por motivo a cada 30 minutos, para uma falha repetida não lotar o canal. */
export function shouldAlert(key: string, now: number, state: Map<string, number> = lastSent, windowMs = THROTTLE_MS): boolean {
  const last = state.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  state.set(key, now);
  if (state.size > 100) state.clear();
  return true;
}

/**
 * Avisa a equipe quando algo do bot falha. Precisa da variável DISCORD_ALERT_WEBHOOK (URL de webhook de um canal privado).
 * Nunca lança erro: um aviso que falha não pode derrubar o que já estava falhando.
 */
export async function alertError(where: string, error: unknown, now = Date.now()): Promise<boolean> {
  try {
    const url = serverEnv("DISCORD_ALERT_WEBHOOK");
    if (!url || !WEBHOOK.test(url) || !shouldAlert(where, now)) return false;
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: alertText(where, error), allowed_mentions: { parse: [] } }),
    });
    return response.ok;
  } catch { return false; }
}

export const alertWebhookStatus = () => {
  const url = serverEnv("DISCORD_ALERT_WEBHOOK");
  return !url ? "faltando (opcional: avisa no Discord quando o bot ou o cron falham)" : WEBHOOK.test(url) ? "ok" : "formato inválido (cole a URL inteira do webhook)";
};
