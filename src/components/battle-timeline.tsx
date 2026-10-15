import { useMemo, useState } from "react";
import { SERIES_COLORS, buildTimeline } from "@/lib/battle-analysis";
import type { BattleDetail } from "@/lib/albion-types";

const W = 760; const H = 300; const PAD = { l: 36, r: 120, t: 14, b: 28 };
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-border p-0.5 text-xs font-semibold">
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded px-2.5 py-1 ${value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{o.label}</button>
      ))}
    </div>
  );
}

/** Gráfico de linhas: kills (ou saldo kills - mortes) acumulados ao longo da luta. */
export function BattleTimeline({ battle }: { battle: BattleDetail }) {
  const [mode, setMode] = useState<"kills" | "momentum">("kills");
  const [by, setBy] = useState<"alliance" | "guild">(battle.alliances.length ? "alliance" : "guild");
  const timeline = useMemo(() => buildTimeline(battle, by, mode), [battle, by, mode]);
  const { series, duration, max, min } = timeline;

  const x = (t: number) => PAD.l + (t / duration) * (W - PAD.l - PAD.r);
  const range = Math.max(1, max - min);
  const y = (v: number) => PAD.t + (1 - (v - min) / range) * (H - PAD.t - PAD.b);
  const yTicks = Array.from({ length: Math.min(range, 5) + 1 }, (_, i) => Math.round(min + (range / Math.min(range, 5)) * i));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * duration);

  return (
    <section className="rounded-xl border border-border bg-card/60 p-3" aria-label="Linha do tempo da batalha">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Linha do tempo</h3>
          <p className="text-xs text-muted-foreground">{mode === "kills" ? "Kills acumuladas" : "Saldo (kills − mortes)"} por {by === "alliance" ? "aliança" : "guilda"} · {battle.kills.length} kills</p>
        </div>
        <div className="flex gap-2">
          <Toggle value={mode} onChange={setMode} options={[{ value: "kills", label: "Kills" }, { value: "momentum", label: "Saldo" }]} />
          <Toggle value={by} onChange={setBy} options={[{ value: "guild", label: "Guilda" }, { value: "alliance", label: "Aliança" }]} />
        </div>
      </div>
      {series.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Sem kills para desenhar.</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Gráfico de kills ao longo do tempo">
          {yTicks.map((v) => (
            <g key={v}><line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">{v}</text></g>
          ))}
          {xTicks.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="11">{fmtTime(t)}</text>)}
          {series.map((s, i) => {
            const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
            // Degraus: cada kill sobe a linha de uma vez, como nos placares.
            const path = s.points.map((p, j) => (j === 0 ? `M${x(p.t)},${y(p.v)}` : `H${x(p.t)}V${y(p.v)}`)).join("");
            return (
              <g key={s.name}>
                <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                <text x={W - PAD.r + 8} y={y(s.end) + 4} fontSize="12" fontWeight="700" fill={color}>{s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name} ({s.end})</text>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}
