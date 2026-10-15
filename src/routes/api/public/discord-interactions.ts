import { createFileRoute } from "@tanstack/react-router";

// Endereço que vai em "Interactions Endpoint URL" no Discord Developer Portal.
export const Route = createFileRoute("/api/public/discord-interactions")({
  server: { handlers: { POST: async ({ request }) => {
    const { discordConfig, verifyDiscordRequest, handleInteraction } = await import("@/lib/discord.server");
    const { publicKey } = discordConfig();
    if (!publicKey) return new Response("Discord não configurado", { status: 503 });
    const body = await request.text();
    const valid = await verifyDiscordRequest(publicKey, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"), body);
    if (!valid) return new Response("Assinatura inválida", { status: 401 });
    let payload;
    try { payload = JSON.parse(body); } catch { return new Response("JSON inválido", { status: 400 }); }
    try {
      return Response.json(await handleInteraction(payload));
    } catch (error) {
      console.error("[discord] interaction", error);
      return Response.json({ type: 4, data: { content: "Algo deu errado. Tente pelo site.", flags: 64 } });
    }
  } } },
});
