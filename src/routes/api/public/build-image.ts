import { createFileRoute } from "@tanstack/react-router";

/** Imagem de uma build ou de um grupo de builds para o Discord: /api/public/build-image?t=b|g&id=UUID */
export const Route = createFileRoute("/api/public/build-image")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("t");
    const id = url.searchParams.get("id") ?? "";
    if ((kind !== "b" && kind !== "g") || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return new Response("Pedido inválido", { status: 400 });
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    const key = new Request(`${url.origin}${url.pathname}?t=${kind}&id=${id}`);
    try { const hit = await cache?.match(key); if (hit) return hit; } catch { /* sem cache */ }
    try {
      const { loadBuild, loadGroup, itemNames } = await import("@/lib/build-discord.server");
      const { renderBuildImage, renderGroupImage } = await import("@/lib/build-image.server");
      let result;
      if (kind === "b") {
        const [build, names] = await Promise.all([loadBuild(id), itemNames()]);
        if (!build) return new Response("Build não encontrada", { status: 404 });
        result = await renderBuildImage(build, names);
      } else {
        const loaded = await loadGroup(id);
        if (!loaded) return new Response("Grupo não encontrado", { status: 404 });
        result = await renderGroupImage(loaded.group, loaded.members);
      }
      // Builds podem ser editadas: cache curto. Se faltou algum ícone, quase nada de cache.
      const maxAge = result.missing ? 30 : 300;
      const response = new Response(result.png as unknown as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${maxAge}`, "X-Content-Type-Options": "nosniff" } });
      if (!result.missing) { try { await cache?.put(key, response.clone()); } catch { /* sem cache */ } }
      return response;
    } catch (error) {
      console.error("[build-image]", error);
      return new Response("Imagem indisponível", { status: 502 });
    }
  } } },
});
