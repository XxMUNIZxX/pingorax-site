import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorldMapView, type MapState } from "@/components/world-map-view";
import { MOUNTS, placeById, type MountId, type RouteMode, type ZoneKind } from "@/lib/world-map";
import { DEFAULT_SHARE_IMAGE, SHARE_ORIGIN } from "@/lib/share-image";

type Search = { rota?: string; modo?: RouteMode; evitar?: string; montaria?: MountId };

const KINDS: ZoneKind[] = ["red", "black", "yellow"];

export const Route = createFileRoute("/mapa")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): Search => {
    const rota = typeof s["rota"] === "string" && /^[A-Za-z0-9,-]{0,120}$/.test(s["rota"]) ? s["rota"] : undefined;
    const evitar = typeof s["evitar"] === "string" && /^[a-z,]{0,40}$/.test(s["evitar"]) ? s["evitar"] : undefined;
    const modo = s["modo"] === "segura" ? "segura" : undefined;
    const montaria = MOUNTS.find((m) => m.id === s["montaria"])?.id;
    return { ...(rota ? { rota } : {}), ...(evitar ? { evitar } : {}), ...(modo ? { modo } : {}), ...(montaria ? { montaria } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Mapa e rotas — PingoraX" },
      { name: "description", content: "Planeje a rota entre zonas do mapa de Albion Online: mais rápida ou mais segura, evitando zonas vermelhas e pretas." },
      { property: "og:title", content: "Mapa e rotas — PingoraX" },
      { property: "og:description", content: "Planejador de rotas do mapa de Albion Online." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: DEFAULT_SHARE_IMAGE },
      { property: "og:url", content: `${SHARE_ORIGIN}/mapa` },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapaPage,
});

function MapaPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/mapa" });
  const state: MapState = {
    stops: (search.rota ?? "").split(",").filter((id) => id === "" || placeById(id)),
    mode: search.modo ?? "rapida",
    avoid: (search.evitar ?? "").split(",").filter((k): k is ZoneKind => (KINDS as string[]).includes(k)),
    mount: search.montaria ?? "media",
  };
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold">Mapa e rotas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Escolha origem e destino (ou clique nas zonas do mapa) e veja o caminho. Roads of Avalon podem entrar na rota como paradas manuais. O endereço da página guarda a rota, então dá para copiar e mandar para a guilda.</p>
      </div>
      <WorldMapView
        state={state}
        onChange={(s) => void navigate({
          replace: true,
          search: {
            ...(s.stops.some(Boolean) ? { rota: s.stops.join(",") } : {}),
            ...(s.mode !== "rapida" ? { modo: s.mode } : {}),
            ...(s.avoid.length ? { evitar: s.avoid.join(",") } : {}),
            ...(s.mount !== "media" ? { montaria: s.mount } : {}),
          },
        })}
      />
      <p className="mt-4 text-xs text-muted-foreground">Dados das zonas e ligações vêm de uma base da comunidade, derivada dos arquivos do jogo, e podem ficar desatualizados após patches. As Roads of Avalon mudam de ligação a cada 12–24 h, então entram só como paradas manuais.</p>
    </main>
  );
}
