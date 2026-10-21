import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KillRow, tierText } from "@/components/kill-parts";
import { ItemSlot } from "@/components/item-slot";
import { useItemNames } from "@/components/build-view";
import { busiestHour, playerStats, type PlayerStats } from "@/lib/albion-stats";
import { fetchPlayer } from "@/lib/albion.functions";
import { shortNumber, type PlayerProfile, type Server } from "@/lib/albion-types";

const stat = "rounded-xl border border-border bg-card/60 p-3";

function Stat({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return <div className={`${stat} text-center`}><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;
}

const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "—");

/** Resumo calculado das kills e mortes recentes do jogador (arma favorita, guildas enfrentadas, horários...). */
function StatsPanel({ stats, server }: { stats: PlayerStats; server: Server }) {
  const nameOf = useItemNames();
  const peak = busiestHour(stats.hours);
  const maxHour = Math.max(1, ...stats.hours);
  const total = stats.kills + stats.deaths;
  if (total === 0) return null;
  return (
    <section aria-label="Estatísticas" className="space-y-3">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Estatísticas das últimas {stats.kills} kills e {stats.deaths} mortes</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="K/D" value={stats.kd === null ? "—" : stats.kd.toFixed(stats.deaths === 0 ? 0 : 2)} sub={`${stats.kills} kills · ${stats.deaths} mortes`} color="text-primary" />
        <Stat label="Fama por kill" value={shortNumber(stats.avgKillFame)} sub={`saldo ${stats.fameGained - stats.fameLost >= 0 ? "+" : "-"}${shortNumber(Math.abs(stats.fameGained - stats.fameLost))}`} color="text-amber-400" />
        <Stat label="Kills sozinho" value={pct(stats.soloKills, stats.kills)} sub={`${stats.soloKills} solo · ${stats.groupKills} em grupo`} />
        <Stat label="Mais ativo às" value={peak === null ? "—" : `${String(peak).padStart(2, "0")}h`} sub="no seu horário" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={stat}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Armas mais usadas</p>
          <ul className="mt-2 space-y-2">
            {stats.weapons.map((w) => (
              <li key={w.code} className="flex items-center gap-3 text-sm">
                <ItemSlot code={w.code} size={40} showTier={false} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{tierText(w.code)} {nameOf(w.code)}</span><span className="text-xs text-muted-foreground">{w.uses} {w.uses === 1 ? "uso" : "usos"} · {w.kills} kills · {w.deaths} mortes</span></span>
              </li>
            ))}
            {stats.weapons.length === 0 && <li className="text-sm text-muted-foreground">Sem dados de equipamento.</li>}
          </ul>
        </div>
        <div className={stat}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Guildas mais enfrentadas</p>
          <ul className="mt-2 space-y-1 text-sm">
            {stats.opponents.map((o) => <li key={o.guild} className="flex justify-between gap-3"><span className="truncate">{o.guild}</span><span className="shrink-0 text-muted-foreground">{o.count}x</span></li>)}
            {stats.opponents.length === 0 && <li className="text-muted-foreground">Nenhuma guilda nos registros.</li>}
          </ul>
        </div>
      </div>
      <div className={stat}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Atividade por hora (seu horário)</p>
        <div className="mt-3 flex h-20 items-end gap-0.5" role="img" aria-label="Kills e mortes por hora do dia">
          {stats.hours.map((count, hour) => (
            <div key={hour} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${String(hour).padStart(2, "0")}h: ${count}`}>
              <div className={`w-full rounded-t ${hour === peak ? "bg-primary" : "bg-primary/40"}`} style={{ height: `${count ? Math.max(6, (count / maxHour) * 100) : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
      </div>
      {(stats.bestKill || stats.worstDeath) && (
        <div className="grid gap-3 md:grid-cols-2">
          {stats.bestKill && <div><p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Melhor kill</p><div className="mt-1"><KillRow kill={stats.bestKill} server={server} kind="kill" /></div></div>}
          {stats.worstDeath && <div><p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Morte mais cara</p><div className="mt-1"><KillRow kill={stats.worstDeath} server={server} kind="death" /></div></div>}
        </div>
      )}
    </section>
  );
}

function Profile({ player, server }: { player: PlayerProfile; server: Server }) {
  const [shown, setShown] = useState(40);
  const stats = playerStats(player.events, -new Date().getTimezoneOffset());
  const kills = player.events.filter((e) => e.kind === "kill");
  const deaths = player.events.filter((e) => e.kind === "death");
  const gained = kills.reduce((sum, e) => sum + e.fame, 0);
  const lost = deaths.reduce((sum, e) => sum + e.fame, 0);
  return (
    <div className="mt-4 space-y-5">
      <header>
        <h2 className="text-3xl font-extrabold">{player.name}</h2>
        <p className="text-sm text-muted-foreground">
          {player.alliance && `[${player.alliance}] `}
          {player.guild && player.guildId ? <Link to="/kills" search={{ servidor: server, guilda: player.guildId }} className="hover:text-primary hover:underline">{player.guild}</Link> : player.guild || (!player.alliance && "sem guilda")}
          {" "}· {server}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fama de kill (total)" value={shortNumber(player.killFame)} color="text-amber-400" />
        <Stat label="Fama de morte (total)" value={shortNumber(player.deathFame)} color="text-red-400" />
        <Stat label="Kills recentes" value={String(kills.length)} sub={`${shortNumber(gained)} de fama`} color="text-emerald-400" />
        <Stat label="Mortes recentes" value={String(deaths.length)} sub={`${shortNumber(lost)} de fama perdida`} color="text-red-400" />
      </div>
      <StatsPanel stats={stats} server={server} />
      <section aria-label="Histórico">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Últimas kills e mortes ({Math.min(shown, player.events.length)} de {player.events.length})</h3>
        <div className="mt-2 space-y-2">
          {player.events.slice(0, shown).map((e) => <KillRow key={`${e.id}-${e.kind}`} kill={e} server={server} kind={e.kind} />)}
          {player.events.length > shown && <div className="text-center"><Button variant="outline" size="sm" onClick={() => setShown(shown + 40)}>Mostrar mais</Button></div>}
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
