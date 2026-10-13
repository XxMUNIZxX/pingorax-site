import { z } from "zod";

export const albionIconLink = z.string().trim().max(1000).url().transform((link, ctx) => {
  const url = new URL(link);
  if (url.origin !== "https://render.albiononline.com" || url.username || url.password || !/^\/v1\/item\/[A-Za-z0-9_@.-]+\.png$/.test(url.pathname)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use um link oficial de imagem PNG do Albion." });
    return z.NEVER;
  }
  return url.href;
});

export async function downloadAlbionIcon(link: string) {
  const url = albionIconLink.parse(link);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("Não foi possível carregar a imagem do Albion.");
  const limit = 2 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) throw new Error("O ícone deve ter no máximo 2 MB.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("O ícone deve ter no máximo 2 MB.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) throw new Error("Este arquivo não é um PNG válido.");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { base64: btoa(binary) };
}