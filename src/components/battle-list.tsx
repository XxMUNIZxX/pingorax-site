import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchBattleList } from "@/lib/albion.functions";
import { SERVERS, fameShort, gameDate, type Server } from "@/lib/albion-types";

export function BattleList({ server, onServer }: { server: Server; onServer: (server: Server) => void }) {
  const [minPlayers, setMinPlayers] = useState(10);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const result = useQuery({
    queryKey: ["battles", server, minPlayers, query.trim().toLowerCase(), page],
    queryFn: () => fetchBattleList({ data: { server, page, minPlayers, query } }),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
  const battles = result.data?.ok ? result.data.battles : [];

  return (
    <section aria-label="Batalhas recentes">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Servidor" className="flex rounded-lg border border-border p-0.5">
          {SERVERS.map((s) => (
            <button key={s.value} role="tab" aria-selected={server === s.value} onClick={() => { onServer(s.value); setPage(0); }}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${server === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{s.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Mín. jogadores
          <Input type="number" min={0} max={500} className="w-20" value={minPlayers} onChange={(e) => { setMinPlayers(Math.max(0, Number(e.target.value) || 0)); setPage(0); }} />
        </label>
        <Input className="min-w-0 flex-1 basis-56" placeholder="Buscar guilda, aliança ou jogador nesta página" aria-label="Buscar" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
        <Button variant="outline" size="sm" onClick={() => void result.refetch()} disabled={result.isFetching}><RefreshCw className={result.isFetching ? "animate-spin" : ""} /> Atualizar</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Atualiza sozinho a cada 15 segundos. A busca olha só as batalhas desta página da lista.</p>

      <div className="mt-5 flex items-baseline justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Batalhas</h2>
        {result.data?.ok && <span className="text-xs text-muted-foreground">{battles.length} resultados</span>}
      </div>
      <div className="mt-2 hidden grid-cols-[1fr_5rem_4rem_5rem] gap-3 px-4 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:grid">
        <span>Guildas · hora</span><span className="text-right">Jogadores</span><span className="text-right">Kills</span><span className="text-right">Fama</span>
      </div>

      <ul className="space-y-2">
        {battles.map((b) => (
          <li key={b.id}>
            <Link to="/lutas" search={{ batalha: b.id, servidor: server }}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card/60 px-4 py-3 transition-colors hover:border-primary/50 hover:bg-card/90 focus-visible:border-primary focus-visible:outline-none sm:grid-cols-[1fr_5rem_4rem_5rem]">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{b.groups.join(", ") || `Batalha #${b.id}`}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{gameDate(b.startTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {gameDate(b.startTime).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · #{b.id}</div>
              </div>
              <div className="col-start-2 row-start-1 flex items-center justify-end gap-3 text-sm font-bold tabular-nums sm:contents">
                <span className="text-right sm:col-start-2" title="Jogadores">{b.players}<span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground sm:hidden">jog.</span></span>
                <span className="text-right text-emerald-400 sm:col-start-3" title="Kills">{b.kills}<span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground sm:hidden">kills</span></span>
                <span className="text-right text-amber-400 sm:col-start-4" title="Fama">{fameShort(b.fame)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {result.isLoading && Array.from({ length: 6 }, (_, i) => <div key={i} className="mt-2 h-[60px] animate-pulse rounded-xl border border-border bg-card/40" />)}
      {!result.isLoading && result.data?.ok && battles.length === 0 && <p className="mt-4 rounded-xl border border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">Nenhuma batalha com esses filtros nesta página. Tente baixar o mínimo de jogadores ou ir para a próxima página.</p>}
      {result.data && !result.data.ok && <p className="mt-4 rounded-xl border border-destructive/50 bg-card/60 p-6 text-center text-sm text-destructive">{result.data.error}</p>}
      <div className="mt-3 flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
        <span className="text-sm text-muted-foreground">Página {page + 1}</span>
        <Button variant="outline" size="sm" disabled={page >= 20} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
      </div>
    </section>
  );
}
