import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/share-image")({
  server: { handlers: { GET: async ({ request }) => {
    const { serverEnv } = await import("@/lib/server-env");
    const version = new URL(request.url).searchParams.get("v");
    if (version && !/^[0-9a-f-]{36}\.jpg$/.test(version)) return new Response("Invalid image", { status: 400 });
    const url = serverEnv("SUPABASE_URL");
    const key = serverEnv("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return new Response("Image unavailable", { status: 503 });
    const { publicShareClient } = await import("@/lib/share-image.server");
    const client = publicShareClient(url, key);
    const { data, error } = await client.from("site_share_settings").select("image_path").eq("id", "site").maybeSingle();
    if (error) return new Response("Image unavailable", { status: 503 });
    if (!data || (version && !data.image_path.endsWith(`/${version}`))) return new Response("Image not found", { status: 404 });
    const result = await client.storage.from("share-images").download(data.image_path);
    if (result.error || !result.data) return new Response("Image unavailable", { status: 503 });
    return new Response(result.data, { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff",
    } });
  } } },
});