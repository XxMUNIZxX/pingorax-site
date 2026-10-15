import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BattleList } from "@/components/battle-list";
import { BattleDetailView } from "@/components/battle-detail";
import type { Server } from "@/lib/albion-types";

type Search = { servidor: Server; batalha?: number };

export const Route = createFileRoute("/lutas")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): Search => {
    const servidor = search["servidor"] === "europe" || search["servidor"] === "asia" ? search["servidor"] : "americas";
    const id = Number(search["batalha"]);
    return { servidor, ...(Number.isInteger(id) && id > 0 ? { batalha: id } : {}) };
  },
  head: () => ({ meta: [
    { title: "Lutas — PingoraX" },
    { name: "description", content: "Batalhas, kills e mortes do Albion Online: placar por aliança e guilda, jogadores e equipamentos." },
    { property: "og:title", content: "Lutas — PingoraX" },
    { property: "og:description", content: "Batalhas, kills e mortes do Albion Online." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: LutasPage,
});

function LutasPage() {
  const { servidor, batalha } = Route.useSearch();
  const navigate = useNavigate({ from: "/lutas" });
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      {batalha === undefined && (
        <div className="mb-5">
          <h1 className="text-3xl font-extrabold">Lutas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Batalhas recentes do Albion Online. Clique numa batalha para ver placar, jogadores, equipamentos e kills.</p>
        </div>
      )}
      {batalha === undefined
        ? <BattleList server={servidor} onServer={(s) => void navigate({ search: { servidor: s } })} />
        : <BattleDetailView server={servidor} id={batalha} />}
    </main>
  );
}
