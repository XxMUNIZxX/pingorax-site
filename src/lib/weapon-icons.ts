import { supabase } from "@/integrations/supabase/client";

export async function validateWeaponIcon(file: File) {
  if (file.type !== "image/png" || !file.name.toLowerCase().endsWith(".png")) {
    throw new Error("Escolha uma imagem PNG.");
  }
  if (file.size > 2 * 1024 * 1024) throw new Error("O ícone deve ter no máximo 2 MB.");
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!png.every((byte, index) => signature[index] === byte)) throw new Error("Este arquivo não é um PNG válido.");
}

export async function fetchWeaponIcon(link: string, loadAlbion?: (link: string) => Promise<{ base64: string } | { error: string }>): Promise<File> {
  let url: URL;
  try { url = new URL(link.trim()); }
  catch { throw new Error("Insira um link válido de imagem PNG."); }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Use um link HTTPS direto para a imagem PNG.");
  }
  if (url.hostname === "render.albiononline.com" && loadAlbion) {
    const result = await loadAlbion(url.href);
    if ("error" in result) throw new Error(result.error);
    const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
    const file = new File([bytes], "weapon-icon.png", { type: "image/png" });
    await validateWeaponIcon(file);
    return file;
  }
  let response: Response;
  try { response = await fetch(url.href, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("Não foi possível carregar esse link. O site pode bloquear o acesso; tente enviar o PNG pelo arquivo."); }
  if (!response.ok) throw new Error("Não foi possível carregar a imagem desse link.");
  if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024) throw new Error("O ícone deve ter no máximo 2 MB.");
  const blob = await response.blob();
  const file = new File([blob], "weapon-icon.png", { type: blob.type });
  await validateWeaponIcon(file);
  return file;
}

export async function uploadWeaponIcon(file: File) {
  await validateWeaponIcon(file);
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw new Error("Entre novamente para enviar o ícone.");
  const path = `${data.user.id}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from("weapon-icons").upload(path, file, { contentType: "image/png", upsert: false });
  if (error) throw error;
  return path;
}

export async function resolveWeaponIcons(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await supabase.storage.from("weapon-icons").createSignedUrls([...new Set(paths)], 86400);
  if (error) return new Map<string, string>();
  return new Map((data ?? []).flatMap((item) => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
}