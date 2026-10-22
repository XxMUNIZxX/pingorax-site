import { serverEnv } from "@/lib/server-env";

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string };

/** Voz e tela ficam desligadas até as três variáveis existirem no Worker (veja docs/VOZ.md). */
/** As chaves do LiveKit Cloud: a API key começa com "API"; o secret é uma sequência longa que não começa assim. */
export function looksSwapped(apiKey: string, apiSecret: string): boolean {
  return !/^API/.test(apiKey) && /^API/.test(apiSecret);
}

export function livekitConfig(): LiveKitConfig | null {
  const url = serverEnv("LIVEKIT_URL");
  const apiKey = serverEnv("LIVEKIT_API_KEY");
  const apiSecret = serverEnv("LIVEKIT_API_SECRET");
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

const encoder = new TextEncoder();
function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Chave de acesso do LiveKit: um JWT HS256 que vale só para uma sala e por pouco tempo. */
export async function signLiveKitToken(opts: { apiKey: string; apiSecret: string; room: string; identity: string; name: string; ttlSeconds?: number; now?: number }): Promise<string> {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: opts.apiKey, sub: opts.identity, name: opts.name, nbf: now - 30, exp: now + (opts.ttlSeconds ?? 4 * 3600),
    video: { room: opts.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey("raw", encoder.encode(opts.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(unsigned)));
  return `${unsigned}.${base64url(signature)}`;
}
