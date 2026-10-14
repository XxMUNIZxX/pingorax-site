import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PanelAccess } from "@/components/panel-access";
import { TeamPanel } from "@/components/team-panel";
import { ShareImagePanel } from "@/components/share-image-panel";
import { WeaponCatalogPanel } from "@/components/weapon-catalog-panel";
import { GearCatalogPanel } from "@/components/gear-catalog-panel";
import { ContentOptionsPanel } from "@/components/content-options-panel";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Administração — PingoraX" },
    { name: "description", content: "Gerencie os acessos da equipe e a imagem de compartilhamento do PingoraX." },
    { property: "og:title", content: "Administração — PingoraX" },
    { property: "og:description", content: "Administração da equipe e das configurações do PingoraX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AdminPage,
});
function AdminPage() {
  return <PanelAccess adminOnly>{() => <main className="mx-auto max-w-5xl px-4 py-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold text-gold">Administração</h1>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><Link to="/criar">Gerenciar conteúdos</Link></Button>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
    </div>
    <TeamPanel />
    <ShareImagePanel />
    <ContentOptionsPanel />
    <WeaponCatalogPanel />
    <GearCatalogPanel />
  </main>}</PanelAccess>;
}
