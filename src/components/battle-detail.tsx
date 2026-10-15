import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ItemSlot } from "@/components/item-slot";
import { BuildGear, useItemNames } from "@/components/build-view";
import { BattleTimeline } from "@/components/battle-timeline";
import { Composition, IpByRole } from "@/components/battle-extras";
import { fetchBattle } from "@/lib/albion.functions";
import { gameDate, shortNumber, type BattleDetail, type BattleGroup, type BattleKill, type BattlePlayer, type Server } from "@/lib/albion-types";

const PAGE_SIZE = 10;
const card = "rounded-xl border border-border bg-card/60";
const th = "p-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";

export function BattleDetailView({ server, id }: { server: Server; id: number }) {
  const result = useQuery({ queryKey: ["battle", server, id], queryFn: () => fetchBattle({ data: { server, id } }), staleTime: 60_000 });
  return (
    <div>
      <Button variant="ghost" size="sm" asChild><Link to="/lutas" search={{ servidor: server }}><ArrowLeft /> Voltar às batalhas</Link></Button>
      {result.isLoading && <p className="mt-6 text-muted-foreground">Carregando batalha #{id}...</p>}
      {result.data && !result.data.ok && <p className="mt-6 text-destructive">{result.data.error}</p>}
      {result.data?.ok && <Battle battle={result.data.battle} />}
    </div>
  );
}

function Battle({ battle }: { battle: BattleDetail }) {
  const nameOf = useItemNames();
  const title = (battle.alliances.length ? battle.alliances : battle.guilds).slice(0, 4).map((g) => g.name).join(", ") || `Batalha #${battle.id}`;

  const highlights = useMemo(() => {
    const topKills = [...battle.players].sort((a, b) => b.kills - a.kills || b.fame - a.fame)[0];
    const topFame = [...battle.players].sort((a, b) => b.fame - a.fame)[0];
    const topIp = [...battle.players].filter((p) => p.ip > 0).sort((a, b) => b.ip - a.ip)[0];
    const bigDeath = [...battle.kills].sort((a, b) => b.fame - a.fame)[0];
    return { topKills, topFame, topIp, bigDeath };
  }, [battle]);

  return (
    <div className="mt-4 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Detalhe da batalha #{battle.id} · {battle.server} · {gameDate(battle.startTime).toLocaleString("pt-BR")}</p>
        <h2 className="mt-1 text-2xl font-extrabold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground"><b className="text-foreground">{battle.players.length}</b> em campo · <b className="text-foreground">{battle.totalKills}</b> kills · <b className="text-foreground">{shortNumber(battle.totalFame)}</b> de fama</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupTable title={`Alianças (${battle.alliances.length})`} first="Aliança" rows={battle.alliances} />
        <GroupTable title={`Guildas (${battle.guilds.length})`} first="Guilda" rows={battle.guilds} showAlliance />
      </div>

      <BattleTimeline battle={battle} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Highlight label="Mais kills" player={highlights.topKills} value={highlights.topKills ? String(highlights.topKills.kills) : "—"} unit="kills" sub={highlights.topKills ? `${highlights.topKills.kills} / ${highlights.topKills.deaths}` : ""} color="text-emerald-400" />
        <HighlightDeath kill={highlights.bigDeath} />
        <Highlight label="Maior IP" player={highlights.topIp} value={highlights.topIp ? String(highlights.topIp.ip) : "—"} unit="item power" sub={highlights.topIp ? `${highlights.topIp.kills} / ${highlights.topIp.deaths}` : ""} color="text-foreground" />
        <Highlight label="Mais fama de kill" player={highlights.topFame} value={highlights.topFame ? shortNumber(highlights.topFame.fame) : "—"} unit="fama" sub={highlights.topFame ? `${highlights.topFame.kills} / ${highlights.topFame.deaths}` : ""} color="text-amber-400" />
      </div>

      <PlayersTable players={battle.players} nameOf={nameOf} />
      <KillsTable kills={battle.kills} nameOf={nameOf} total={battle.totalKills} />
      <IpByRole players={battle.players} />
      <Composition players={battle.players} />
    </div>
  );
}

function GroupTable({ title, first, rows, showAlliance }: { title: string; first: string; rows: BattleGroup[]; showAlliance?: boolean }) {
  return (
    <section className={`${card} overflow-x-auto`}>
      <h3 className="px-3 pt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <table className="w-full min-w-[460px] text-sm">
        <thead><tr><th className={th}>{first}</th>{showAlliance && <th className={th}>Aliança</th>}<th className={`${th} text-right`}>Jog.</th><th className={`${th} text-right`}>Kills</th><th className={`${th} text-right`}>Mortes</th><th className={`${th} text-right`}>IP</th><th className={`${th} text-right`}>Fama</th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.name} className="border-t border-border/60">
              <td className="p-2.5 font-semibold">{g.name}</td>
              {showAlliance && <td className="p-2.5 text-muted-foreground">{g.alliance || "—"}</td>}
              <td className="p-2.5 text-right">{g.players}</td>
              <td className="p-2.5 text-right text-emerald-400">{g.kills}</td>
              <td className="p-2.5 text-right text-red-400">{g.deaths}</td>
              <td className="p-2.5 text-right text-amber-300">{g.ip || "—"}</td>
              <td className="p-2.5 text-right text-amber-400">{shortNumber(g.fame)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="p-3 text-muted-foreground">Sem dados.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function Highlight({ label, player, value, unit, sub, color }: { label: string; player: BattlePlayer | undefined; value: string; unit: string; sub: string; color: string }) {
  return (
    <div className={`${card} p-3 text-center`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-bold">{player?.name ?? "—"}</p>
      <p className="truncate text-xs text-muted-foreground">{player ? [player.alliance && `[${player.alliance}]`, player.guild].filter(Boolean).join(" ") || "—" : ""}</p>
      <div className="mt-2 flex justify-center"><BuildGear build={player?.gear ?? {}} size={40} /></div>
      <p className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{unit}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function HighlightDeath({ kill }: { kill: BattleKill | undefined }) {
  return (
    <div className={`${card} p-3 text-center`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Maior morte (fama)</p>
      <p className="mt-1 truncate font-bold">{kill?.victim.name ?? "—"}</p>
      <p className="truncate text-xs text-muted-foreground">{kill ? [kill.victim.alliance && `[${kill.victim.alliance}]`, kill.victim.guild].filter(Boolean).join(" ") || "—" : ""}</p>
      <div className="mt-2 flex justify-center"><BuildGear build={kill?.victim.gear ?? {}} size={40} /></div>
      <p className="mt-2 text-2xl font-extrabold text-red-400">{kill ? shortNumber(kill.fame) : "—"}</p>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">fama perdida</p>
      <p className="text-xs text-muted-foreground">{kill ? `morto por ${kill.killer.name}` : ""}</p>
    </div>
  );
}

type PlayerSort = "name" | "guild" | "alliance" | "ip" | "kills" | "deaths" | "fame";

function PlayersTable({ players, nameOf }: { players: BattlePlayer[]; nameOf: (code: string) => string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PlayerSort>("kills");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? players.filter((p) => `${p.name} ${p.guild} ${p.alliance}`.toLowerCase().includes(q)) : players;
    const dir = asc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = a[sort]; const y = b[sort];
      const primary = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) * dir : ((x as number) - (y as number)) * dir;
      return primary || b.fame - a.fame;
    });
  }, [players, query, sort, asc]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  function header(key: PlayerSort, label: string, right = false) {
    const active = sort === key;
    return (
      <th className={`${th} ${right ? "text-right" : ""}`}>
        <button className={`inline-flex items-center gap-0.5 uppercase tracking-widest ${active ? "text-foreground" : ""}`} onClick={() => { if (active) setAsc(!asc); else { setSort(key); setAsc(key === "name" || key === "guild" || key === "alliance"); } setPage(0); }}>
          {label}{active && (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      </th>
    );
  }

  return (
    <section className={`${card} p-3`} aria-label="Jogadores">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Jogadores ({players.length})</h3>
      <Input className="mt-2 max-w-xs" placeholder="Buscar jogador, guilda ou aliança" aria-label="Buscar jogadores" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr><th className={th}>Arma</th>{header("name", "Nome")}{header("guild", "Guilda")}{header("alliance", "Aliança")}{header("ip", "IP", true)}{header("kills", "Kills", true)}{header("deaths", "Mortes", true)}{header("fame", "Fama", true)}</tr></thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.name} className="border-t border-border/60">
                <td className="p-2"><ItemSlot code={p.gear.weapon ?? null} size={40} /></td>
                <td className="p-2"><div className="font-semibold">{p.name}</div><div className="text-xs text-muted-foreground">{p.gear.weapon ? nameOf(p.gear.weapon) : "equip. não visto"}</div></td>
                <td className="p-2 text-muted-foreground">{p.guild || "—"}</td>
                <td className="p-2 text-muted-foreground">{p.alliance || "—"}</td>
                <td className="p-2 text-right">{p.ip || "—"}</td>
                <td className="p-2 text-right text-emerald-400">{p.kills}</td>
                <td className="p-2 text-right text-red-400">{p.deaths}</td>
                <td className="p-2 text-right text-amber-400">{shortNumber(p.fame)}</td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum jogador encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(0)}>Primeira</Button>
        <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</Button>
        <span className="px-2 text-sm text-muted-foreground">{rows.length ? `${current * PAGE_SIZE + 1}–${Math.min(rows.length, (current + 1) * PAGE_SIZE)} de ${rows.length}` : "0"} · página {current + 1}/{pages}</span>
        <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Próxima</Button>
        <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(pages - 1)}>Última</Button>
      </div>
    </section>
  );
}

function KillsTable({ kills, nameOf, total }: { kills: BattleKill[]; nameOf: (code: string) => string; total: number }) {
  const [asc, setAsc] = useState(true);
  const rows = asc ? kills : [...kills].reverse();
  const tag = (s: { alliance: string; guild: string }) => [s.alliance && `[${s.alliance}]`, s.guild].filter(Boolean).join(" ") || "—";
  return (
    <section className={`${card} p-3`} aria-label="Kills">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Kills ({total}){kills.length < total && <span className="ml-2 normal-case tracking-normal">mostrando as {kills.length} primeiras</span>}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr>
            <th className={th}><button className="inline-flex items-center gap-0.5 uppercase tracking-widest" onClick={() => setAsc(!asc)}>Hora {asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}</button></th>
            <th className={th}>Matador</th><th className={`${th} text-right`}>IP</th><th className={th} aria-hidden>→</th><th className={th}>Vítima</th><th className={`${th} text-right`}>IP</th><th className={`${th} text-right`}>Fama</th>
          </tr></thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.id} className="border-t border-border/60">
                <td className="whitespace-nowrap p-2 text-muted-foreground">{gameDate(k.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                <td className="p-2"><Person name={k.killer.name} sub={tag(k.killer)} weapon={k.killer.gear.weapon} nameOf={nameOf} /></td>
                <td className="p-2 text-right">{k.killer.ip || "—"}</td>
                <td className="p-2 text-muted-foreground" aria-hidden>→</td>
                <td className="p-2"><Person name={k.victim.name} sub={tag(k.victim)} weapon={k.victim.gear.weapon} nameOf={nameOf} /></td>
                <td className="p-2 text-right">{k.victim.ip || "—"}</td>
                <td className="p-2 text-right text-amber-400">{shortNumber(k.fame)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nenhuma kill registrada nessa batalha.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Person({ name, sub, weapon, nameOf }: { name: string; sub: string; weapon: string | undefined; nameOf: (code: string) => string }) {
  return (
    <div className="flex items-center gap-2" title={weapon ? nameOf(weapon) : undefined}>
      <ItemSlot code={weapon ?? null} size={36} showTier={false} />
      <div className="min-w-0"><div className="truncate font-semibold">{name}</div><div className="truncate text-xs text-muted-foreground">{sub}</div></div>
    </div>
  );
}
