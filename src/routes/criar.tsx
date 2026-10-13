import { createFileRoute } from "@tanstack/react-router";
import { ContentPanel } from "@/components/content-panel";
import { PanelAccess } from "@/components/panel-access";
export const Route = createFileRoute("/criar")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Criação de conteúdo — PingoraX" },
    { name: "description", content: "Crie e gerencie seus conteúdos de Albion Online, armas, horários e vagas no PingoraX." },
    { property: "og:title", content: "Criação de conteúdo — PingoraX" },
    { property: "og:description", content: "Gerencie os conteúdos, armas e vagas que você organiza no PingoraX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: CreationPage,
});
function CreationPage() { return <PanelAccess>{access => <ContentPanel key={access.userId} {...access} />}</PanelAccess>; }
