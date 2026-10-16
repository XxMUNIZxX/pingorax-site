import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KillRow } from "@/components/kill-parts";
import { fetchPlayerSearch, fetchRecentKills } from "@/lib/albion.functions";
import { SERVERS, shortNumber, type Server } from "@/lib/albion-types";

/** Busca de jogador pelo nome (resultado leva ao histórico dele). */
export function PlayerSearch({ server }: { server: Server }) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(text.trim()), 350); return () => clearTimeout(t); }, [text]);
  const enabled = debounced.length >= 2;
  const result = useQuery({ queryKey: ["player-search", server, debounced], enabled, queryFn: () => fetchPlayerSearch({ data: { server, query: debounced } }), staleTime: 60_000 });
  const players = result.data?.ok ? result.data.players : [];
  return (
    <div className="relative min-w-0 flex-1 basis-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" placeholder="Buscar jogador pelo nome" aria-label="Buscar jogador" value={text} onChange={(e) => setText(e.target.value)} />
      {enabled && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl" role="listbox" aria-label="Resultados">
          {result.isFetching && <p className="p-3 text-sm text-muted-foreground">Buscando...</p>}
          {!result.isFetching && result.data?.ok && players.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum jogador encontrado com esse nome.</p>}
          {result.data && !result.data.ok && <p className="p-3 text-sm text-destructive">{result.data.error}</p>}
          {players.map((p) => (
            <Link key={p.id} to="/kills" search={{ servidor: server, jogador: p.id }} role="option" onClick={() => setText("")}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-secondary">
              <span className="min-w-0"><b className="block truncate">{p.name}</b><span className="block truncate text-xs text-muted-foreground">{[p.alliance && `[${p.alliance}]`, p.guild].filter(Boolean).join(" ") || "sem guilda"}</span></span>
              <span className="shrink-0 text-xs text-amber-400">{shortNumber(p.killFame)} fama</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Feed das últimas kills do servidor. */
export function KillFeed({ server, onServer }: { server: Server; onServer: (server: Server) => void }) {
  const feed = useQuery({ queryKey: ["recent-kills", server], queryFn: () => fetchRecentKills({ data: { server } }), refetchInterval: 20_000, placeholderData: keepPreviousData, staleTime: 15_000 });
  const kills = feed.data?.ok ? feed.data.kills : [];
  return (
    <section aria-label="Kills recentes">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Servidor" className="flex rounded-lg border border-border p-0.5">
          {SERVERS.map((s) => (
            <button key={s.value} role="tab" aria-selected={server === s.value} onClick={() => onServer(s.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${server === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{s.label}</button>
          ))}
        </div>
        <PlayerSearch server={server} />
        <Button variant="outline" size="sm" onClick={() => void feed.refetch()} disabled={feed.isFetching}><RefreshCw className={feed.isFetching ? "animate-spin" : ""} /> Atualizar</Button>
      </div>
      <h2 className="mt-5 px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Últimas kills · atualiza a cada 20 s</h2>
      <div className="mt-2 space-y-2">
        {kills.map((k) => <KillRow key={k.id} kill={k} server={server} />)}
        {feed.isLoading && Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[76px] animate-pulse rounded-xl border border-border bg-card/40" />)}
        {feed.data && !feed.data.ok && <p className="rounded-xl border border-destructive/50 bg-card/60 p-6 text-center text-sm text-destructive">{feed.data.error}</p>}
      </div>
    </section>
  );
}
