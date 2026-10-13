import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { albionIconLink, downloadAlbionIcon } from "@/lib/albion-icons";

export const getAlbionWeaponIcon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => albionIconLink.parse(input))
  .handler(async ({ data, context }) => {
    const { data: canCreate, error } = await context.supabase.rpc("can_access_content_panel");
    if (error || !canCreate) return { error: "Sua conta não tem acesso para carregar ícones." };
    try { return await downloadAlbionIcon(data); }
    catch { return { error: "Não foi possível carregar a imagem do Albion. Confira o link e tente novamente." }; }
  });