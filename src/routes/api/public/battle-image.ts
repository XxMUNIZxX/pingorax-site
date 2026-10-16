import { createFileRoute } from "@tanstack/react-router";

/** Resumo da batalha em imagem para o Discord: /api/public/battle-image?s=americas&id=123 */
export const Route = createFileRoute("/api/public/battle-image")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const server = url.searchParams.get("s") ?? "";
    const id = Number(url.searchParams.get("id"));
    if (!["americas", "europe", "asia"].includes(server) || !Number.isSafeInteger(id) || id <= 0) return new Response("Pedido inválido", { status: 400 });
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    const key = new Request(`${url.origin}${url.pathname}?s=${server}&id=${id}`);
    try { const hit = await cache?.match(key); if (hit) return hit; } catch { /* sem cache */ }
    try {
      const { getBattle } = await import("@/lib/albion.server");
      const { renderBattleImage } = await import("@/lib/battle-image.server");
      const png = await renderBattleImage(await getBattle(server as "americas" | "europe" | "asia", id));
      // Batalha em andamento muda: cache curto.
      const response = new Response(png as unknown as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=120", "X-Content-Type-Options": "nosniff" } });
      try { await cache?.put(key, response.clone()); } catch { /* sem cache */ }
      return response;
    } catch (error) {
      console.error("[battle-image]", error);
      return new Response("Imagem indisponível", { status: 502 });
    }
  } } },
});
