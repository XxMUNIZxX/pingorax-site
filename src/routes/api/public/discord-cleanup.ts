import { createFileRoute } from "@tanstack/react-router";

// Tira do canal as mensagens de conteúdos que já passaram. A Cloudflare chama este endereço sozinha a cada 10 minutos
// (veja "triggers" no wrangler.jsonc e src/worker.ts). Também dá para chamar à mão. É seguro: só remove o que já venceu.
async function run() {
  const { discordConfig, cleanupExpiredPosts } = await import("@/lib/discord.server");
  try {
    return Response.json({ ok: true, ...(await cleanupExpiredPosts(discordConfig())) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[discord] limpeza", error);
    return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const Route = createFileRoute("/api/public/discord-cleanup")({
  server: { handlers: { GET: run, POST: run } },
});
