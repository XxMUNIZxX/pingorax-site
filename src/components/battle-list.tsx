import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchBattleList } from "@/lib/albion.functions";
import { SERVERS, gameDate, shortNumber, type Server } from "@/lib/albion-types";

export function BattleList({ server, onServer }: { server: Server; onServer: (server: Server) => void }) {
  const [minPlayers, setMinPlayers] = useState(10);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const navigate = useNavigate({ from: "/lutas" });
  const open = (id: number) => void navigate({ search: { batalha: id, servidor: server } });
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card/60">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="p-3">Data</th><th className="p-3">Batalha</th><th className="p-3 text-right">Jogadores</th><th className="p-3 text-right">Kills</th><th className="p-3 text-right">Fama</th></tr>
          </thead>
          <tbody>
            {battles.map((b) => (
              <tr key={b.id} tabIndex={0} onClick={() => open(b.id)} onKeyDown={(e) => { if (e.key === "Enter") open(b.id); }}
                className="cursor-pointer border-t border-border/60 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none">
                <td className="whitespace-nowrap p-3 text-muted-foreground">{gameDate(b.startTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="p-3">
                  <Link to="/lutas" search={{ batalha: b.id, servidor: server }} className="font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>#{b.id}</Link>
                  <div className="text-xs text-muted-foreground">{b.groups.join(", ") || "—"}</div>
                </td>
                <td className="p-3 text-right">{b.players}</td>
                <td className="p-3 text-right text-emerald-400">{b.kills}</td>
                <td className="p-3 text-right text-amber-400">{shortNumber(b.fame)}</td>
              </tr>
            ))}
            {result.isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Carregando batalhas...</td></tr>}
            {!result.isLoading && result.data?.ok && battles.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma batalha com esses filtros nesta página. Tente baixar o mínimo de jogadores ou ir para a próxima página.</td></tr>}
            {result.data && !result.data.ok && <tr><td colSpan={5} className="p-6 text-center text-destructive">{result.data.error}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
        <span className="text-sm text-muted-foreground">Página {page + 1}</span>
        <Button variant="outline" size="sm" disabled={page >= 20} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
      </div>
    </section>
  );
}
