import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemSlot } from "@/components/item-slot";
import { BuildGear, useItemNames } from "@/components/build-view";
import { SendToDiscord } from "@/components/send-to-discord";
import { fetchKill } from "@/lib/albion.functions";
import { gameDate, shortNumber, type KillDetail, type KillSide, type Server } from "@/lib/albion-types";

const card = "rounded-xl border border-border bg-card/60";

function Fighter({ side, server, align }: { side: KillSide; server: Server; align: "left" | "right" }) {
  return (
    <div className={`min-w-0 text-center ${align === "left" ? "md:text-left" : "md:text-right"}`}>
      {side.id
        ? <Link to="/kills" search={{ servidor: server, jogador: side.id }} className="text-xl font-extrabold text-primary hover:underline">{side.name}</Link>
        : <span className="text-xl font-extrabold">{side.name}</span>}
      {side.ip > 0 && <sup className="ml-1 text-xs text-muted-foreground">{side.ip}</sup>}
      <div className="text-xs font-semibold text-muted-foreground">{[side.alliance && `[${side.alliance}]`, side.guild].filter(Boolean).join(" ") || "sem guilda"}</div>
      <div className="mt-3 flex justify-center md:[justify-content:inherit]"><BuildGear build={side.gear} size={54} /></div>
    </div>
  );
}

function Body({ kill, server }: { kill: KillDetail; server: Server }) {
  const nameOf = useItemNames();
  const when = gameDate(kill.time);
  return (
    <div className="mt-4 space-y-5">
      <section className={`${card} p-4`}>
        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          <Fighter side={kill.killer} server={server} align="left" />
          <div className="text-center">
            <p className="text-sm font-semibold italic text-muted-foreground">matou</p>
            <p className="mt-2 text-2xl font-extrabold text-amber-400">{kill.fame.toLocaleString("pt-BR")}</p>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">fama</p>
            <p className="mt-3 text-xs text-muted-foreground">{when.toLocaleString("pt-BR")}</p>
            {kill.assists > 0 && <p className="text-xs text-muted-foreground">+{kill.assists} participante(s)</p>}
            {kill.battleId > 0 && <Button className="mt-2" size="sm" variant="outline" asChild><Link to="/lutas" search={{ servidor: server, batalha: kill.battleId }}>Ver batalha #{kill.battleId}</Link></Button>}
          </div>
          <Fighter side={kill.victim} server={server} align="right" />
        </div>
      </section>

      {kill.inventory.length > 0 && (
        <section className={`${card} p-4`} aria-label="Inventário">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Inventário de {kill.victim.name}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {kill.inventory.map((item, i) => (
              <span key={`${item.type}-${i}`} className="relative inline-flex" title={nameOf(item.type)}>
                <ItemSlot code={item.type} size={52} />
                {item.count > 1 && <span className="absolute left-0 top-0 rounded-br-md bg-black/75 px-1 text-[10px] font-bold">{item.count}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {kill.participants.length > 0 && (
        <section className={`${card} p-4`} aria-label="Participantes">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Participantes ({kill.participants.length})</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {kill.participants.map((p) => (
              <li key={p.id || p.name} className="rounded-lg border border-border/60 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {p.id ? <Link to="/kills" search={{ servidor: server, jogador: p.id }} className="font-bold text-primary hover:underline">{p.name}</Link> : <b>{p.name}</b>}
                    {p.ip > 0 && <sup className="ml-1 text-[10px] text-muted-foreground">{p.ip}</sup>}
                  </span>
                  <span className="shrink-0 text-xs"><span className="text-red-400">{shortNumber(p.damage)} dano</span>{p.heal > 0 && <span className="ml-2 text-emerald-400">{shortNumber(p.heal)} cura</span>}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{[p.alliance && `[${p.alliance}]`, p.guild].filter(Boolean).join(" ") || "—"}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(["weapon", "offhand", "helmet", "armor", "boots", "cape", "mount", "potion", "food"] as const).map((slot) => p.gear[slot] ? <ItemSlot key={slot} code={p.gear[slot]!} size={30} showTier={false} /> : null)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function KillDetailView({ server, id }: { server: Server; id: number }) {
  const result = useQuery({ queryKey: ["kill", server, id], queryFn: () => fetchKill({ data: { server, id } }), staleTime: 300_000 });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/kills" search={{ servidor: server }}><ArrowLeft /> Voltar às kills</Link></Button>
        <SendToDiscord kind="kill" server={server} id={id} />
      </div>
      {result.isLoading && <p className="mt-6 text-muted-foreground">Carregando kill #{id}...</p>}
      {result.data && !result.data.ok && <p className="mt-6 text-destructive">{result.data.error}</p>}
      {result.data?.ok && <Body kill={result.data.kill} server={server} />}
    </div>
  );
}
