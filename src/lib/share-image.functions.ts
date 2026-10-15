import { createServerFn } from "@tanstack/react-start";
import { shareImageUrl } from "@/lib/share-image";
import { serverEnv } from "@/lib/server-env";

export const getShareImage = createServerFn({ method: "GET" }).handler(async () => {
  const url = serverEnv("SUPABASE_URL");
  const key = serverEnv("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return shareImageUrl();
  const { publicShareClient } = await import("@/lib/share-image.server");
  const { data, error } = await publicShareClient(url, key).from("site_share_settings").select("image_path").eq("id", "site").maybeSingle();
  return shareImageUrl(error ? null : data?.image_path);
});