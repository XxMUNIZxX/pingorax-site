import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Coins } from "lucide-react";
import { fetchMyLoot } from "@/lib/loot";

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Quanto o jogador recebeu de loot nos conteúdos com sessão fechada. Some se não houver histórico ou se a migração 0023 não foi rodada. */
export function MyLootPanel({ nick }: { nick: string | null }) {
  const q = useQuery({ queryKey: ["my-loot", nick], enabled: !!nick, retry: false, staleTime: 60_000, queryFn: () => fetchMyLoot(nick!) });
  if (!nick || !q.data || q.data.length === 0) return null;
  const total = q.data.reduce((s, e) => s + e.mine, 0);
  return (
    <section className="mt-6" aria-label="Meu loot">
      <h2 className="flex flex-wrap items-center gap-x-2 text-lg font-bold"><Coins className="h-4 w-4 text-primary" /> Meu loot <span className="text-sm font-normal text-muted-foreground">{q.data.length} conteúdos · {fmt(total)} de prata</span></h2>
      <ul className="mt-2 space-y-1.5">
        {q.data.slice(0, 15).map((e) => (
          <li key={e.sessionId}>
            <Link to="/evento/$id" params={{ id: e.eventId }} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/40 px-3 py-2 hover:border-primary/60">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{e.eventTitle}</span>
                <span className="block truncate text-xs text-muted-foreground">{new Date(e.at).toLocaleDateString("pt-BR")} · {e.sessionTitle}</span>
              </span>
              <span className="shrink-0 font-semibold text-amber-400">{fmt(e.mine)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
