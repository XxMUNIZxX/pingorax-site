import { createFileRoute } from "@tanstack/react-router";

// Endereço que vai em "Interactions Endpoint URL" no Discord Developer Portal.
export const Route = createFileRoute("/api/public/discord-interactions")({
  server: { handlers: {
    // Abrir este endereço no navegador mostra o que está configurado (só sim/não, nunca os valores).
    GET: async () => {
      const { discordConfig } = await import("@/lib/discord.server");
      const { serverEnv } = await import("@/lib/server-env");
      const cfg = discordConfig();
      const keyOk = !!cfg.publicKey && /^[0-9a-f]{64}$/.test(cfg.publicKey);
      return Response.json({
        endpoint: "discord-interactions",
        DISCORD_PUBLIC_KEY: !cfg.publicKey ? "faltando" : keyOk ? "ok" : `formato inválido (deve ter 64 letras/números, tem ${cfg.publicKey.length})`,
        DISCORD_BOT_TOKEN: cfg.botToken ? "ok" : "faltando",
        DISCORD_APP_ID: serverEnv("DISCORD_APP_ID") ? "ok" : "faltando (só precisa para o convite e o comando /pingorax)",
        DISCORD_CHANNEL_ID: cfg.channelId ? (/^[0-9]{5,25}$/.test(cfg.channelId) ? "ok" : "formato inválido (use só o número do canal, sem barra)") : "faltando",
        // Comparação: as variáveis do Supabase (que já funcionam) chegam ao servidor?
        SUPABASE_URL: serverEnv("SUPABASE_URL") ? "ok" : "faltando",
        // Só os NOMES das variáveis que o servidor enxerga (nunca os valores).
        variaveis_visiveis: Object.keys(process.env).filter((name) => /^(DISCORD|SUPABASE|SITE|VITE)/.test(name)).sort(),
      }, { headers: { "Cache-Control": "no-store" } });
    },
    POST: async ({ request }) => {
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
    },
  } },
});
