import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KillRow } from "@/components/kill-parts";
import { fetchPlayer } from "@/lib/albion.functions";
import { shortNumber, type PlayerProfile, type Server } from "@/lib/albion-types";

const stat = "rounded-xl border border-border bg-card/60 p-3";

function Stat({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return <div className={`${stat} text-center`}><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;
}

function Profile({ player, server }: { player: PlayerProfile; server: Server }) {
  const kills = player.events.filter((e) => e.kind === "kill");
  const deaths = player.events.filter((e) => e.kind === "death");
  const gained = kills.reduce((sum, e) => sum + e.fame, 0);
  const lost = deaths.reduce((sum, e) => sum + e.fame, 0);
  return (
    <div className="mt-4 space-y-5">
      <header>
        <h2 className="text-3xl font-extrabold">{player.name}</h2>
        <p className="text-sm text-muted-foreground">{[player.alliance && `[${player.alliance}]`, player.guild].filter(Boolean).join(" ") || "sem guilda"} · {server}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fama de kill (total)" value={shortNumber(player.killFame)} color="text-amber-400" />
        <Stat label="Fama de morte (total)" value={shortNumber(player.deathFame)} color="text-red-400" />
        <Stat label="Kills recentes" value={String(kills.length)} sub={`${shortNumber(gained)} de fama`} color="text-emerald-400" />
        <Stat label="Mortes recentes" value={String(deaths.length)} sub={`${shortNumber(lost)} de fama perdida`} color="text-red-400" />
      </div>
      <section aria-label="Histórico">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Últimas kills e mortes ({player.events.length})</h3>
        <div className="mt-2 space-y-2">
          {player.events.map((e) => <KillRow key={`${e.id}-${e.kind}`} kill={e} server={server} kind={e.kind} />)}
          {player.events.length === 0 && <p className="rounded-xl border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">Nenhuma kill ou morte recente para esse jogador.</p>}
        </div>
      </section>
    </div>
  );
}

export function PlayerView({ server, id }: { server: Server; id: string }) {
  const result = useQuery({ queryKey: ["player", server, id], queryFn: () => fetchPlayer({ data: { server, id } }), staleTime: 60_000 });
  return (
    <div>
      <Button variant="ghost" size="sm" asChild><Link to="/kills" search={{ servidor: server }}><ArrowLeft /> Voltar às kills</Link></Button>
      {result.isLoading && <p className="mt-6 text-muted-foreground">Carregando jogador...</p>}
      {result.data && !result.data.ok && <p className="mt-6 text-destructive">{result.data.error}</p>}
      {result.data?.ok && <Profile player={result.data.player} server={server} />}
    </div>
  );
}
