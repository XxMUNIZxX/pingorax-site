import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchGuild } from "@/lib/albion.functions";
import { shortNumber, type GuildProfile, type Server } from "@/lib/albion-types";

const box = "rounded-xl border border-border bg-card/60 p-3 text-center";

function Box({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return <div className={box}><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;
}

function Guild({ guild, server }: { guild: GuildProfile; server: Server }) {
  const ratio = guild.deathFame > 0 ? guild.killFame / guild.deathFame : null;
  return (
    <div className="mt-4 space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold">{guild.name}</h2>
        <p className="text-sm text-muted-foreground">
          {guild.allianceTag ? `[${guild.allianceTag}] ` : ""}{guild.alliance}
          {guild.founder ? ` · fundada por ${guild.founder}` : ""} · {server}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Box label="Membros" value={String(guild.memberCount || guild.members.length)} />
        <Box label="Fama de kills" value={shortNumber(guild.killFame)} color="text-emerald-400" sub={`mortes ${shortNumber(guild.deathFame)}`} />
        <Box label="Razão de fama" value={ratio === null ? "—" : ratio.toFixed(2)} color="text-primary" />
        <Box label="Ataques / defesas" value={`${guild.attacksWon} / ${guild.defensesWon}`} sub="vencidos" />
      </div>
      <section aria-label="Membros">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Membros por fama de kills (top {guild.members.length})</h3>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card/60">
          {guild.members.map((m, i) => (
            <li key={m.id}>
              <Link to="/kills" search={{ servidor: server, jogador: m.id }} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-secondary">
                <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                <b className="min-w-0 flex-1 truncate">{m.name}</b>
                <span className="shrink-0 text-amber-400">{shortNumber(m.killFame)}</span>
                <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">{shortNumber(m.deathFame)} mortes</span>
              </Link>
            </li>
          ))}
          {guild.members.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sem lista de membros.</li>}
        </ul>
      </section>
    </div>
  );
}

export function GuildView({ server, id }: { server: Server; id: string }) {
  const result = useQuery({ queryKey: ["guild", server, id], queryFn: () => fetchGuild({ data: { server, id } }), staleTime: 5 * 60_000 });
  return (
    <div>
      <Button variant="ghost" size="sm" asChild><Link to="/kills" search={{ servidor: server }}><ArrowLeft /> Voltar às kills</Link></Button>
      {result.isLoading && <p className="mt-6 text-muted-foreground">Carregando guilda...</p>}
      {result.data && !result.data.ok && <p className="mt-6 text-destructive">{result.data.error}</p>}
      {result.isError && <p className="mt-6 text-destructive">Não foi possível carregar a guilda.</p>}
      {result.data?.ok && <Guild guild={result.data.guild} server={server} />}
    </div>
  );
}
