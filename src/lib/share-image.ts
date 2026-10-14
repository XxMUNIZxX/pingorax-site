const configuredOrigin = import.meta.env["VITE_SITE_URL"] as string | undefined;
export const SHARE_ORIGIN = (configuredOrigin || "https://pingorax.online").replace(/\/+$/, "");
export const DEFAULT_SHARE_IMAGE = `${SHARE_ORIGIN}/og-banner.jpg?v=2`;

export function shareImageUrl(path?: string | null) {
  return path ? `${SHARE_ORIGIN}/api/public/share-image?v=${encodeURIComponent(path.split("/").pop() ?? "")}` : DEFAULT_SHARE_IMAGE;
}

export async function prepareShareImage(file: File): Promise<Blob> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Escolha uma imagem PNG, JPG ou WebP.");
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 1 || bitmap.height < 1) throw new Error("Imagem inválida.");
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem.");
    // Fill the preview with the photo, preserving its proportions.
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível preparar a imagem.")), "image/jpeg", 0.9));
  } finally { bitmap.close(); }
}