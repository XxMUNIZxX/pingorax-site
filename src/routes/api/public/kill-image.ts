import { createFileRoute } from "@tanstack/react-router";

/** Imagem da kill para a mensagem do Discord: /api/public/kill-image?s=americas&id=123 */
export const Route = createFileRoute("/api/public/kill-image")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const server = url.searchParams.get("s") ?? "";
    const id = Number(url.searchParams.get("id"));
    if (!["americas", "europe", "asia"].includes(server) || !Number.isSafeInteger(id) || id <= 0) return new Response("Pedido inválido", { status: 400 });
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    const key = new Request(`${url.origin}${url.pathname}?s=${server}&id=${id}`);
    try { const hit = await cache?.match(key); if (hit) return hit; } catch { /* sem cache */ }
    try {
      const { killDetail } = await import("@/lib/albion-kills.server");
      const { renderKillImage } = await import("@/lib/kill-image.server");
      const { png, missing } = await renderKillImage(await killDetail(server as "americas" | "europe" | "asia", id));
      // Imagem incompleta (algum ícone não veio) fica pouco tempo no cache, para a próxima vez sair inteira.
      const maxAge = missing ? 30 : 86400;
      const response = new Response(png as unknown as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${maxAge}`, "X-Content-Type-Options": "nosniff" } });
      if (!missing) { try { await cache?.put(key, response.clone()); } catch { /* sem cache */ } }
      return response;
    } catch (error) {
      console.error("[kill-image]", error);
      return new Response("Imagem indisponível", { status: 502 });
    }
  } } },
});
