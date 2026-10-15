import { useEffect, useMemo, useRef, useState } from "react";
import { ItemSlot } from "@/components/item-slot";
import { useItemNames } from "@/components/build-view";
import { SERIES_COLORS, buildTimeline, valueAt, type Series, type TimelineEvent } from "@/lib/battle-analysis";
import { parseGearCode } from "@/lib/builds";
import { gameDate, shortNumber, type BattleDetail, type BattleKill } from "@/lib/albion-types";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const tier = (code?: string) => { const p = code ? parseGearCode(code) : null; return p ? `${p.tier}${p.enchant ? `.${p.enchant}` : ""}` : ""; };

/** Curva suave que não passa dos valores (monótona), em coordenadas de tela. */
function smoothPath(raw: [number, number][]) {
  // Vários eventos no mesmo segundo viram um degrau vertical só.
  const pts: [number, number][] = [];
  for (const p of raw) { const last = pts[pts.length - 1]; if (last && Math.abs(last[0] - p[0]) < 0.01) last[1] = p[1]; else pts.push([p[0], p[1]]); }
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]},${pts[0]![1]}` : "";
  const n = pts.length; const dx: number[] = []; const m: number[] = []; const tg: number[] = [];
  for (let k = 0; k < n - 1; k++) { dx[k] = pts[k + 1]![0] - pts[k]![0]; m[k] = (pts[k + 1]![1] - pts[k]![1]) / dx[k]!; }
  tg[0] = m[0]!; tg[n - 1] = m[n - 2]!;
  for (let k = 1; k < n - 1; k++) {
    if (m[k - 1]! * m[k]! <= 0) tg[k] = 0;
    else { const w1 = 2 * dx[k]! + dx[k - 1]!; const w2 = dx[k]! + 2 * dx[k - 1]!; tg[k] = (w1 + w2) / (w1 / m[k - 1]! + w2 / m[k]!); }
  }
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let k = 0; k < n - 1; k++) {
    const [x0, y0] = pts[k]!; const [x1, y1] = pts[k + 1]!; const w = dx[k]! / 3;
    d += `C${x0 + w},${y0 + tg[k]! * w} ${x1 - w},${y1 - tg[k + 1]! * w} ${x1},${y1}`;
  }
  return d;
}
const stepPath = (pts: [number, number][]) => pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `H${p[0]}V${p[1]}`)).join("");

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

type Cluster = { x: number; y: number; color: string; series: Series; events: TimelineEvent[] };
type Hover = { kind: "node"; cluster: Cluster } | { kind: "guide"; t: number } | null;

/** Linha do tempo interativa: zoom (scroll), mover (arrastar), ligar/desligar grupos e ver quem morreu em cada ponto. */
export function BattleTimeline({ battle }: { battle: BattleDetail }) {
  const nameOf = useItemNames();
  const [mode, setMode] = useState<"kills" | "momentum">("kills");
  const [by, setBy] = useState<"alliance" | "guild">(battle.alliances.length ? "alliance" : "guild");
  const [steps, setSteps] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hover, setHover] = useState<Hover>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const timeline = useMemo(() => buildTimeline(battle, by, mode), [battle, by, mode]);
  const { duration } = timeline;
  const [view, setView] = useState<[number, number]>([0, duration]);
  useEffect(() => { setView([0, duration]); }, [duration, by, mode]);

  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.max(260, Math.floor(entry.contentRect.width))); });
    observer.observe(el); setWidth(Math.max(260, Math.floor(el.clientWidth)));
    return () => observer.disconnect();
  }, []);

  const narrow = width < 520;
  const H = narrow ? 260 : 330;
  const PAD = { l: 32, r: narrow ? 64 : 118, t: 12, b: 26 };
  const plotW = width - PAD.l - PAD.r; const plotH = H - PAD.t - PAD.b;
  const [a, b] = view;
  const x = (t: number) => PAD.l + ((t - a) / (b - a)) * plotW;
  const visible = timeline.series.map((s, i) => ({ s, color: SERIES_COLORS[i % SERIES_COLORS.length]!, on: !hidden.includes(s.name) })).filter((v) => v.on);
  const allValues = (visible.length ? visible : timeline.series.map((s) => ({ s }))).flatMap((v) => v.s.points.map((p) => p.v));
  const max = Math.max(1, ...allValues); const min = Math.min(0, ...allValues);
  const range = Math.max(1, max - min);
  const y = (v: number) => PAD.t + (1 - (v - min) / range) * plotH;
  const tickCount = Math.min(range, 5);
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round(min + (range / tickCount) * i));
  const xTicks = Array.from({ length: narrow ? 4 : 6 }, (_, i, list) => a + ((b - a) / (list.length - 1)) * i);

  // Zoom com a rodinha, sem rolar a página.
  const viewRef = useRef(view); viewRef.current = view;
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const [va, vb] = viewRef.current;
      const anchor = va + clamp((event.clientX - rect.left - PAD.l) / plotW, 0, 1) * (vb - va);
      const factor = event.deltaY < 0 ? 0.8 : 1.25;
      const span = clamp((vb - va) * factor, Math.min(2, duration), duration);
      const na = clamp(anchor - (anchor - va) * (span / (vb - va)), 0, duration - span);
      setView([na, na + span]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [plotW, duration, PAD.l]);

  const drag = useRef<{ x: number; a: number; b: number; moved: boolean } | null>(null);
  const localX = (event: React.PointerEvent) => event.clientX - svg.current!.getBoundingClientRect().left;
  const localY = (event: React.PointerEvent) => event.clientY - svg.current!.getBoundingClientRect().top;

  function onDown(event: React.PointerEvent) {
    drag.current = { x: event.clientX, a: view[0], b: view[1], moved: false };
    svg.current?.setPointerCapture(event.pointerId);
  }
  function onMove(event: React.PointerEvent) {
    const px = localX(event); const py = localY(event);
    setPointer({ x: px, y: py });
    const d = drag.current;
    if (d && Math.abs(event.clientX - d.x) > 3) d.moved = true;
    if (d?.moved) {
      const span = d.b - d.a;
      const shift = -((event.clientX - d.x) / plotW) * span;
      const na = clamp(d.a + shift, 0, duration - span);
      setView([na, na + span]); setHover(null);
      return;
    }
    if (hover?.kind === "node") return;
    if (px >= PAD.l && px <= PAD.l + plotW) setHover({ kind: "guide", t: a + ((px - PAD.l) / plotW) * (b - a) });
    else setHover(null);
  }
  function onUp(event: React.PointerEvent) { drag.current = null; svg.current?.releasePointerCapture(event.pointerId); }

  // Pontos próximos viram um só (com o número de kills dentro).
  const clusters = useMemo(() => {
    const out: Cluster[] = [];
    for (const { s, color } of visible) {
      let current: Cluster | null = null;
      for (const e of s.events) {
        const px = x(e.t);
        if (px < PAD.l - 10 || px > PAD.l + plotW + 10) continue;
        if (current && Math.abs(current.x - px) < 8 && Math.abs(current.y - y(e.v)) < 24) { current.events.push(e); current.y = y(e.v); }
        else { current = { x: px, y: y(e.v), color, series: s, events: [e] }; out.push(current); }
      }
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, hidden, view, width, mode]);

  const guideT = hover?.kind === "guide" ? hover.t : null;
  const lastKill: BattleKill | undefined = guideT === null ? undefined : [...battle.kills].reverse().find((k) => (gameDate(k.time).getTime() - gameDate(battle.kills[0]!.time).getTime()) / 1000 <= guideT);
  const lastTime = lastKill ? (gameDate(lastKill.time).getTime() - gameDate(battle.kills[0]!.time).getTime()) / 1000 : 0;
  const zoomed = b - a < duration - 0.01;
  const tipW = 250;
  const tipLeft = clamp(pointer.x + 14, 0, Math.max(0, width - tipW));
  const tipTop = clamp(pointer.y - 10, 0, H - 40);

  return (
    <section className="rounded-xl border border-border bg-card/60 p-3" aria-label="Linha do tempo da batalha">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Linha do tempo</h3>
          <p className="text-xs text-muted-foreground">{mode === "kills" ? "Kills" : "Saldo (kills − mortes)"} por {by === "alliance" ? "aliança" : "guilda"} · <b className="text-foreground">{battle.kills.length}</b> kills</p>
        </div>
        <div className="flex gap-2">
          <Toggle value={mode} onChange={setMode} options={[{ value: "kills", label: "Kills" }, { value: "momentum", label: "Saldo" }]} />
          <Toggle value={by} onChange={setBy} options={[{ value: "guild", label: "Guilda" }, { value: "alliance", label: "Aliança" }]} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Grupos no gráfico">
        {timeline.series.map((s, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length]!; const on = !hidden.includes(s.name);
          return (
            <button key={s.name} aria-pressed={on} onClick={() => setHidden(on ? [...hidden, s.name] : hidden.filter((n) => n !== s.name))}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${on ? "bg-secondary/60" : "opacity-45"}`} style={{ borderColor: on ? color : undefined }}>
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />{s.name}
            </button>
          );
        })}
      </div>

      <div ref={box} className="relative mt-2 w-full select-none">
        <svg ref={svg} width={width} height={H} role="img" aria-label="Gráfico de kills ao longo do tempo" style={{ touchAction: "pan-y", cursor: drag.current?.moved ? "grabbing" : "crosshair" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (hover?.kind === "guide") setHover(null); }}>
          <defs>
            <clipPath id="plot-clip"><rect x={PAD.l} y={PAD.t - 4} width={plotW} height={plotH + 8} /></clipPath>
            {visible.map(({ s, color }) => (
              <linearGradient key={s.name} id={`fill-${s.name.replace(/[^a-zA-Z0-9]/g, "_")}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
            ))}
          </defs>
          {yTicks.map((v) => (
            <g key={v}><line x1={PAD.l} x2={PAD.l + plotW} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">{v}</text></g>
          ))}
          {xTicks.map((t, i) => <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-muted-foreground" fontSize="11">{fmtTime(t)}</text>)}

          <g clipPath="url(#plot-clip)">
            {visible.map(({ s, color }) => {
              const pts = s.points.map((p): [number, number] => [x(p.t), y(p.v)]);
              const line = steps ? stepPath(pts) : smoothPath(pts);
              const first = pts[0]![0]; const last = pts[pts.length - 1]![0];
              return (
                <g key={s.name}>
                  <path d={`${line}L${last},${y(Math.max(0, min))}L${first},${y(Math.max(0, min))}Z`} fill={`url(#fill-${s.name.replace(/[^a-zA-Z0-9]/g, "_")})`} stroke="none" />
                  <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                </g>
              );
            })}
            {guideT !== null && <line x1={x(guideT)} x2={x(guideT)} y1={PAD.t} y2={PAD.t + plotH} stroke="currentColor" className="text-muted-foreground" strokeOpacity="0.6" />}
            {clusters.map((c, i) => {
              const many = c.events.length > 1; const active = hover?.kind === "node" && hover.cluster === c;
              return (
                <g key={i} onPointerEnter={() => setHover({ kind: "node", cluster: c })} onPointerLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                  <circle cx={c.x} cy={c.y} r={many ? 10 : active ? 6 : 4} fill={many ? "#0b1512" : c.color} stroke={c.color} strokeWidth={many ? 2 : 1.5} />
                  {many && <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{c.events.length}</text>}
                  <circle cx={c.x} cy={c.y} r={14} fill="transparent" />
                </g>
              );
            })}
          </g>
          {visible.map(({ s, color }) => {
            const label = s.name.length > (narrow ? 8 : 15) ? `${s.name.slice(0, narrow ? 7 : 14)}…` : s.name;
            return <text key={s.name} x={PAD.l + plotW + 6} y={clamp(y(s.end) + 4, PAD.t + 8, PAD.t + plotH)} fontSize="11" fontWeight="700" fill={color}>{label} {s.end}</text>;
          })}
        </svg>

        {hover?.kind === "guide" && (
          <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover/95 p-2 text-xs shadow-lg" style={{ left: tipLeft, top: tipTop, width: tipW }}>
            <div className="text-muted-foreground">{fmtTime(hover.t)}</div>
            {visible.map(({ s, color }) => (
              <div key={s.name} className="mt-0.5 flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-1.5"><i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} /><span className="truncate">{s.name}</span></span><b>{valueAt(s, hover.t)}</b></div>
            ))}
            {lastKill && <div className="mt-1.5 border-t border-border pt-1.5"><b>{lastKill.victim.name}</b> morreu para {by === "alliance" ? lastKill.killer.alliance || lastKill.killer.guild : lastKill.killer.guild || lastKill.killer.alliance || "?"}<div className="text-muted-foreground">{fmtTime(lastTime)} · {shortNumber(lastKill.fame)} de fama</div></div>}
          </div>
        )}
        {hover?.kind === "node" && (
          <div className="pointer-events-none absolute z-20 rounded-lg border border-border bg-popover/95 p-2 text-xs shadow-lg" style={{ left: clamp(hover.cluster.x + 12, 0, Math.max(0, width - 270)), top: clamp(hover.cluster.y - 20, 0, H - 40), width: 270 }}>
            <div className="mb-1 font-bold" style={{ color: hover.cluster.color }}>{hover.cluster.events.length} {hover.cluster.events[0]!.kind === "death" ? "mortes" : "kills"} · {hover.cluster.series.name}</div>
            <ul className="space-y-1">
              {[...hover.cluster.events].reverse().slice(0, 6).map((e) => (
                <li key={`${e.kill.id}-${e.kind}`} className="flex items-center gap-2">
                  <ItemSlot code={e.kill.victim.gear.weapon ?? null} size={30} showTier={false} />
                  <div className="min-w-0 flex-1"><div className="truncate font-bold">{e.kill.victim.name}{e.kind === "death" && <span className="ml-1 font-normal text-red-400">morreu</span>}</div><div className="truncate text-muted-foreground">{e.kill.victim.gear.weapon ? `${tier(e.kill.victim.gear.weapon)} ${nameOf(e.kill.victim.gear.weapon)}` : "equip. não visto"}</div></div>
                  <div className="text-right"><div className="text-muted-foreground">{fmtTime(e.t)}</div><div className="font-bold text-amber-400">{shortNumber(e.kill.fame)}</div></div>
                </li>
              ))}
            </ul>
            {hover.cluster.events.length > 6 && <div className="mt-1 text-muted-foreground">+{hover.cluster.events.length - 6} mais</div>}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Scroll: zoom · Arrastar: mover · Passe o mouse nos pontos para ver quem morreu</span>
        <span className="flex gap-2">
          <button className="rounded border border-border px-2 py-1 font-semibold hover:text-foreground" aria-pressed={steps} onClick={() => setSteps(!steps)}>{steps ? "Curva suave" : "Mostrar degraus"}</button>
          <button className="rounded border border-border px-2 py-1 font-semibold hover:text-foreground disabled:opacity-40" disabled={!zoomed} onClick={() => setView([0, duration])}>Resetar zoom</button>
        </span>
      </div>
    </section>
  );
}
