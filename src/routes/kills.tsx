import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KillFeed } from "@/components/kill-feed";
import { KillDetailView } from "@/components/kill-detail";
import { PlayerView } from "@/components/player-view";
import { SectionBoundary } from "@/components/section-boundary";
import type { Server } from "@/lib/albion-types";

type Search = { servidor: Server; jogador?: string; kill?: number };

export const Route = createFileRoute("/kills")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): Search => {
    const servidor = search["servidor"] === "europe" || search["servidor"] === "asia" ? search["servidor"] : "americas";
    const kill = Number(search["kill"]);
    const jogador = typeof search["jogador"] === "string" && /^[A-Za-z0-9_-]{10,40}$/.test(search["jogador"]) ? search["jogador"] : undefined;
    return { servidor, ...(Number.isInteger(kill) && kill > 0 ? { kill } : {}), ...(jogador ? { jogador } : {}) };
  },
  head: () => ({ meta: [
    { title: "Kills — PingoraX" },
    { name: "description", content: "Kills e mortes do Albion Online: feed ao vivo, histórico de jogadores e detalhe de cada kill com equipamento." },
    { property: "og:title", content: "Kills — PingoraX" },
    { property: "og:description", content: "Kills e mortes do Albion Online." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: KillsPage,
});

function KillsPage() {
  const { servidor, jogador, kill } = Route.useSearch();
  const navigate = useNavigate({ from: "/kills" });
  const home = kill === undefined && jogador === undefined;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      {home && (
        <div className="mb-5">
          <h1 className="text-3xl font-extrabold">Kills</h1>
          <p className="mt-1 text-sm text-muted-foreground">Kills e mortes do Albion Online. Busque um jogador para ver o histórico dele, ou clique numa kill para ver o equipamento.</p>
        </div>
      )}
      <SectionBoundary label="Kills">
        {kill !== undefined ? <KillDetailView server={servidor} id={kill} />
          : jogador !== undefined ? <PlayerView server={servidor} id={jogador} />
          : <KillFeed server={servidor} onServer={(s) => void navigate({ search: { servidor: s } })} />}
      </SectionBoundary>
    </main>
  );
}
