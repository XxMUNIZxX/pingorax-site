import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { fetchKill } from "@/lib/albion.functions";
import { ItemSlot } from "@/components/item-slot";
import { useItemNames } from "@/components/build-view";
import { parseGearCode } from "@/lib/builds";
import { shortNumber, timeAgo, type KillSide, type KillSummary, type Server } from "@/lib/albion-types";

export const tierText = (code?: string) => { const p = code ? parseGearCode(code) : null; return p ? `${p.tier}${p.enchant ? `.${p.enchant}` : ""}` : ""; };

/** Arma, nome (link para o jogador), IP e guilda de um lado da kill. */
export function SideBlock({ side, server, nameOf, align = "left" }: { side: KillSide; server: Server; nameOf: (code: string) => string; align?: "left" | "right" }) {
  const weapon = side.gear.weapon;
  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${align === "right" ? "md:flex-row-reverse md:text-right" : ""}`}>
      <ItemSlot code={weapon ?? null} size={46} showTier={false} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-1.5 md:[justify-content:inherit]">
          {side.id
            ? <Link to="/kills" search={{ servidor: server, jogador: side.id }} onClick={(e) => e.stopPropagation()} className="truncate text-sm font-bold hover:text-primary hover:underline">{side.name}</Link>
            : <span className="truncate text-sm font-bold">{side.name}</span>}
          {side.ip > 0 && <sup className="text-[10px] text-muted-foreground">{side.ip}</sup>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{[side.alliance && `[${side.alliance}]`, side.guild].filter(Boolean).join(" ") || "—"}</div>
        {weapon && <div className="truncate text-[11px] text-muted-foreground/80">{tierText(weapon)} {nameOf(weapon)}</div>}
      </div>
    </div>
  );
}

const KIND = { kill: { label: "KILL", color: "text-emerald-400", border: "border-l-emerald-500" }, death: { label: "MORTE", color: "text-red-400", border: "border-l-red-500" } } as const;

/** Linha de kill (feed e histórico do jogador). Clicar em qualquer ponto abre a kill. */
export function KillRow({ kill, server, kind }: { kill: KillSummary; server: Server; kind?: "kill" | "death" }) {
  const navigate = useNavigate();
  const nameOf = useItemNames();
  const queryClient = useQueryClient();
  // Começa a buscar o detalhe assim que o mouse (ou dedo) chega na linha; o clique já encontra tudo pronto.
  const warm = () => void queryClient.prefetchQuery({ queryKey: ["kill", server, kill.id], queryFn: () => fetchKill({ data: { server, id: kill.id } }), staleTime: 300_000 });
  const open = () => {
    queryClient.setQueryData(["kill-preview", server, kill.id], kill); // o cabeçalho aparece na hora
    void navigate({ to: "/kills", search: { servidor: server, kill: kill.id } });
  };
  const mark = kind ? KIND[kind] : null;
  return (
    <div role="link" tabIndex={0} onClick={open} onMouseEnter={warm} onFocus={warm} onTouchStart={warm} onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      className={`grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card/60 px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-card/90 focus-visible:border-primary focus-visible:outline-none md:grid-cols-[4.5rem_minmax(0,1fr)_1.75rem_minmax(0,1fr)_auto] ${mark ? `border-l-4 ${mark.border}` : ""}`}>
      <div className="order-1 text-xs md:order-none">
        {mark && <div className={`font-bold ${mark.color}`}>{mark.label}</div>}
        <div className="font-semibold text-muted-foreground">{timeAgo(kill.time)}</div>
      </div>
      <div className="order-3 col-span-2 md:order-none md:col-span-1"><SideBlock side={kill.killer} server={server} nameOf={nameOf} /></div>
      <span className="hidden text-center text-xs font-semibold italic text-muted-foreground md:block">vs.</span>
      <div className="order-4 col-span-2 md:order-none md:col-span-1"><SideBlock side={kill.victim} server={server} nameOf={nameOf} /></div>
      <div className="order-2 text-right text-sm font-bold md:order-none">
        <div className="text-amber-400">{shortNumber(kill.fame)}</div>
        {kill.assists > 0 && <div className="text-[11px] font-normal text-muted-foreground">+{kill.assists} part.</div>}
      </div>
    </div>
  );
}
