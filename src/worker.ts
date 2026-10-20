import server from "@tanstack/react-start/server-entry";

// Ponto de entrada do Worker: o site de sempre + a limpeza agendada do Discord (cron em wrangler.jsonc).
export default {
  fetch: (request: Request) => server.fetch(request),
  async scheduled(_controller: unknown, _env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    const origin = process.env["SITE_ORIGIN"]?.trim() || "https://pingorax.online";
    ctx.waitUntil(
      server.fetch(new Request(`${origin}/api/public/discord-cleanup`, { method: "POST" }))
        .then((response) => { if (!response.ok) console.error("[discord] limpeza agendada falhou", response.status); })
        .catch((error) => console.error("[discord] limpeza agendada", error)),
    );
  },
};
