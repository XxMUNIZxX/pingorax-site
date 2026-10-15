import { useMemo, useState } from "react";
import { ItemSlot } from "@/components/item-slot";
import { BuildGear, useItemNames } from "@/components/build-view";
import { ROLES, ROLE_COLOR, groupOf, ipByRole, roleOf, type Role } from "@/lib/battle-analysis";
import { baseOf, parseGearCode } from "@/lib/builds";
import type { BattlePlayer } from "@/lib/albion-types";

const card = "rounded-xl border border-border bg-card/60 p-3";

/** IP médio por função (DPS / Healer / Tank, estimadas pela arma) em cada aliança ou guilda. */
export function IpByRole({ players }: { players: BattlePlayer[] }) {
  const groups = useMemo(() => ipByRole(players).filter((g) => g.ip > 0).slice(0, 6), [players]);
  const values = groups.flatMap((g) => ROLES.map((r) => g.roles[r].ip)).filter((v) => v > 0);
  if (!values.length) return null;
  const top = Math.max(...values); const low = Math.min(...values);
  const floor = Math.max(0, Math.floor((low - 100) / 100) * 100);
  const ceil = Math.ceil((top + 20) / 100) * 100;
  const height = (ip: number) => (ip > 0 ? `${Math.max(4, ((ip - floor) / Math.max(1, ceil - floor)) * 100)}%` : "0%");

  return (
    <section className={card} aria-label="IP por função">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">IP por função</h3>
        <div className="flex gap-3 text-xs">{ROLES.map((r) => <span key={r} className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ROLE_COLOR[r] }} />{r}</span>)}</div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Função estimada pela arma e mão secundária vistas. Escala de {floor} a {ceil}.</p>
      <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
        {groups.map((g) => (
          <div key={g.group} className="rounded-lg border border-border/60 p-2 text-center">
            <div className="flex h-36 items-end justify-center gap-1.5 border-b border-border/60">
              {ROLES.map((r) => (
                <div key={r} className="flex h-full w-5 flex-col justify-end text-center" title={`${r}: ${g.roles[r].count} jogador(es), IP ${g.roles[r].ip || "—"}`}>
                  <span className="text-[10px] text-muted-foreground">{g.roles[r].ip || ""}</span>
                  <div className="rounded-t" style={{ height: height(g.roles[r].ip), background: ROLE_COLOR[r] }} />
                </div>
              ))}
            </div>
            <p className="mt-1 truncate text-sm font-semibold">{g.group}</p>
            <p className="text-[11px] text-muted-foreground">{g.players} jog. · IP {g.ip}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const tierName = (code: string) => { const p = parseGearCode(code); return p ? `${p.tier}${p.enchant ? `.${p.enchant}` : ""}` : ""; };

/** Composição estimada de cada aliança/guilda: funções, armas e builds vistas. */
export function Composition({ players }: { players: BattlePlayer[] }) {
  const nameOf = useItemNames();
  const groups = useMemo(() => {
    const map = new Map<string, BattlePlayer[]>();
    for (const p of players) map.set(groupOf(p), [...(map.get(groupOf(p)) ?? []), p]);
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
  }, [players]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"parties" | "builds">("parties");
  const name = selected && groups.some(([g]) => g === selected) ? selected : groups[0]?.[0];
  const rows = groups.find(([g]) => g === name)?.[1] ?? [];
  const withGear = rows.filter((p) => p.gear.weapon);

  const byRole = useMemo(() => {
    const out: Record<Role, BattlePlayer[]> = { DPS: [], Healer: [], Tank: [] };
    for (const p of withGear) { const r = roleOf(p.gear); if (r) out[r].push(p); }
    return out;
  }, [withGear]);
  const builds = useMemo(() => {
    const map = new Map<string, { gear: BattlePlayer["gear"]; count: number; names: string[] }>();
    for (const p of withGear) {
      const key = `${baseOf(p.gear.weapon!)}|${baseOf(p.gear.armor ?? "")}`;
      const hit = map.get(key);
      if (hit) { hit.count++; hit.names.push(p.name); } else map.set(key, { gear: p.gear, count: 1, names: [p.name] });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [withGear]);

  if (!groups.length) return null;
  return (
    <section className={card} aria-label="Composição">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Composição</h3>
        <div className="flex rounded-md border border-border p-0.5 text-xs font-semibold">
          {([["parties", "Funções"], ["builds", "Builds"]] as const).map(([v, label]) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`rounded px-2.5 py-1 ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {groups.map(([g, list]) => (
          <button key={g} onClick={() => setSelected(g)} aria-pressed={g === name}
            className={`rounded-md border px-2.5 py-1 text-xs ${g === name ? "border-primary bg-primary/15 font-bold" : "border-border text-muted-foreground hover:text-foreground"}`}>{g} · {list.length}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Equipamento visto para <b className="text-foreground">{withGear.length} de {rows.length}</b> jogadores, com base nas kills e mortes. A função é estimada pela arma.</p>

      {view === "parties" ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ROLES.map((r) => byRole[r].length > 0 && <span key={r} className="rounded-full border px-2.5 py-0.5 text-xs font-bold" style={{ borderColor: ROLE_COLOR[r], color: ROLE_COLOR[r] }}>{r} {byRole[r].length}</span>)}
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.flatMap((r) => byRole[r]).map((p) => {
              const role = roleOf(p.gear)!;
              return (
                <li key={p.name} className="flex items-center gap-2 rounded-md border p-1.5" style={{ borderColor: `${ROLE_COLOR[role]}88`, background: `${ROLE_COLOR[role]}1f` }}>
                  <ItemSlot code={p.gear.weapon ?? null} size={36} />
                  <div className="min-w-0"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{role}</div><div className="truncate text-sm font-semibold">{nameOf(p.gear.weapon!)}</div><div className="truncate text-[11px] text-muted-foreground">{p.name}</div></div>
                </li>
              );
            })}
            {withGear.length === 0 && <li className="text-sm text-muted-foreground">Nenhum equipamento visto para este grupo.</li>}
          </ul>
        </>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {builds.map((b) => (
            <li key={`${b.gear.weapon}${b.gear.armor}`} className="rounded-lg border border-border/60 p-2">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{nameOf(b.gear.weapon!)}</span><span className="rounded bg-secondary px-1.5 text-xs font-bold">×{b.count}</span></div>
              <div className="mt-2 flex justify-center"><BuildGear build={b.gear} size={44} /></div>
              <p className="mt-1 truncate text-center text-[11px] text-muted-foreground" title={b.names.join(", ")}>{tierName(b.gear.weapon!)} · {b.names.slice(0, 3).join(", ")}{b.names.length > 3 ? "…" : ""}</p>
            </li>
          ))}
          {builds.length === 0 && <li className="text-sm text-muted-foreground">Nenhum equipamento visto para este grupo.</li>}
        </ul>
      )}
    </section>
  );
}
