import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/events";
import { fetchMyPings, type MyPing } from "@/lib/my-pings";

const MARK = { present: { text: "Compareceu", className: "text-success" }, absent: { text: "Faltou", className: "text-destructive" } } as const;

function Row({ ping }: { ping: MyPing }) {
  const mark = ping.attendance ? MARK[ping.attendance] : null;
  return (
    <li>
      <Link to="/evento/$id" params={{ id: ping.id }} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/40 px-3 py-2 hover:border-primary/60">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{ping.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{formatDate(ping.starts_at)}{ping.weapon ? ` · ${ping.weapon}` : ""}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold">
          {mark ? <span className={mark.className}>{mark.text}</span> : ping.status === "waitlist" ? <span className="text-amber-400">Na fila</span> : <span className="text-primary">Confirmado</span>}
        </span>
      </Link>
    </li>
  );
}

/** "Meus pings": o que a pessoa tem marcado e o histórico de presença, pelo nick do perfil. */
export function MyPingsPanel({ nick }: { nick: string | null }) {
  const pings = useQuery({ queryKey: ["my-pings", nick], queryFn: () => fetchMyPings(nick!), enabled: !!nick, staleTime: 60_000, retry: false });
  if (!nick) return null;
  const data = pings.data;
  return (
    <section className="mt-8 space-y-4" aria-label="Meus pings">
      <h2 className="text-xl font-bold">Meus pings</h2>
      {pings.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {pings.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar seus pings.</p>}
      {data && (
        <>
          <div>
            <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Próximos</h3>
            <ul className="mt-2 space-y-2">
              {data.upcoming.map((p) => <Row key={p.id} ping={p} />)}
              {data.upcoming.length === 0 && <li className="text-sm text-muted-foreground">Você não está em nenhum conteúdo por enquanto. <Link to="/conteudos" className="text-primary underline">Ver conteúdos</Link></li>}
            </ul>
          </div>
          {data.past.length > 0 && (
            <div>
              <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Últimos conteúdos{data.rate !== null ? ` · presença ${Math.round(data.rate * 100)}% (${data.present} de ${data.present + data.absent} marcados)` : ""}
              </h3>
              <ul className="mt-2 space-y-2">{data.past.map((p) => <Row key={p.id} ping={p} />)}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
