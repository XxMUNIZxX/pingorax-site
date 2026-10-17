import { useMemo, useRef, useState } from "react";
import { ArrowDown, Plus, RotateCcw, Route as RouteIcon, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EDGES, KIND_COLOR, KIND_LABEL, MOUNTS, ROADS, ZONES, dangerSummary, estimateSeconds, formatDuration, isGraphZone, placeById, planRoute, searchPlaces,
  type MountId, type Place, type PlaceKind, type RoadZone, type RouteMode, type Zone, type ZoneKind,
} from "@/lib/world-map";

export type MapState = { stops: string[]; mode: RouteMode; avoid: ZoneKind[]; mount: MountId };

const AVOIDABLE: ZoneKind[] = ["red", "black", "yellow"];

function ZonePicker({ label, value, onChange, onRemove }: { label: string; value: string | undefined; onChange: (id: string | undefined) => void; onRemove?: () => void }) {
  const zone = placeById(value);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchPlaces(text), [text]);
  return (
    <div className="relative">
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-1">
        <Input
          value={open ? text : zone?.name ?? text}
          placeholder="Digite o nome da zona"
          onFocus={() => { setText(""); setOpen(true); }}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { onChange(results[0].id); setOpen(false); (e.target as HTMLInputElement).blur(); } }}
        />
        {(zone || onRemove) && (
          <Button type="button" variant="ghost" size="icon" aria-label="Limpar" onClick={() => { if (onRemove) onRemove(); else onChange(undefined); setText(""); }}>
            <X className="size-4" />
          </Button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {results.map((z) => (
            <li key={z.id}>
              <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-secondary" onMouseDown={(e) => { e.preventDefault(); onChange(z.id); setText(""); setOpen(false); }}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[z.kind] }} />
                <span className="min-w-0 flex-1 truncate">{z.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{KIND_LABEL[z.kind]}{z.tier ? ` · T${z.tier}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BOUNDS = (() => {
  const xs = ZONES.map((z) => z.x), ys = ZONES.map((z) => -z.y);
  const pad = 20;
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
})();

function MapCanvas({ path, stops, onPick }: { path: Place[]; stops: string[]; onPick: (z: Zone) => void }) {
  const [view, setView] = useState(BOUNDS);
  const drag = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const onRoute = useMemo(() => new Set(path.map((z) => z.id)), [path]);
  const runs = useMemo(() => {
    const out: Zone[][] = [];
    let cur: Zone[] = [];
    for (const p of path) {
      if (isGraphZone(p)) cur.push(p);
      else { if (cur.length > 1) out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
    return out;
  }, [path]);
  const scale = view.w / BOUNDS.w;

  function zoom(factor: number, cx?: number, cy?: number) {
    setView((v) => {
      const w = Math.min(BOUNDS.w, Math.max(60, v.w * factor));
      const h = w * (BOUNDS.h / BOUNDS.w);
      const fx = cx === undefined ? 0.5 : (cx - v.x) / v.w;
      const fy = cy === undefined ? 0.5 : (cy - v.y) / v.h;
      return { x: cx === undefined ? v.x + (v.w - w) / 2 : cx - fx * w, y: cy === undefined ? v.y + (v.h - h) / 2 : cy - fy * h, w, h };
    });
  }
  function toMap(e: { clientX: number; clientY: number }) {
    const r = svg.current!.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * view.h };
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-[70vh] min-h-[420px] w-full touch-none select-none"
        onWheel={(e) => { const p = toMap(e); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y); }}
        onPointerDown={(e) => { drag.current = { px: e.clientX, py: e.clientY, moved: false }; (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const r = svg.current!.getBoundingClientRect();
          const dx = ((e.clientX - d.px) / r.width) * view.w, dy = ((e.clientY - d.py) / r.height) * view.h;
          if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 3) d.moved = true;
          if (d.moved) { setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy })); d.px = e.clientX; d.py = e.clientY; }
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <g stroke="currentColor" className="text-border" strokeWidth={0.5 * Math.max(scale, 0.3)} opacity={path.length ? 0.45 : 0.8}>
          {EDGES.map(([a, b], i) => <line key={i} x1={ZONES[a]!.x} y1={-ZONES[a]!.y} x2={ZONES[b]!.x} y2={-ZONES[b]!.y} />)}
        </g>
        {runs.map((run, i) => (
          <polyline key={i} points={run.map((z) => `${z.x},${-z.y}`).join(" ")} fill="none" stroke="#6db6ff" strokeWidth={2.2 * Math.max(scale, 0.35)} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {ZONES.map((z) => {
          const big = z.kind === "city" || z.kind === "blackcity";
          const isStop = stops.includes(z.id);
          const r = (isStop ? 4.2 : onRoute.has(z.id) ? 3.2 : big ? 3 : 2) * Math.max(scale, 0.35);
          return (
            <circle key={z.id} cx={z.x} cy={-z.y} r={r} fill={KIND_COLOR[z.kind]} stroke={isStop ? "#fff" : "none"} strokeWidth={1 * Math.max(scale, 0.35)}
              className="cursor-pointer" onClick={() => { if (!drag.current?.moved) onPick(z); }}>
              <title>{z.name} — {KIND_LABEL[z.kind]}{z.tier ? ` T${z.tier}` : ""}</title>
            </circle>
          );
        })}
        {ZONES.filter((z) => onRoute.has(z.id) || (scale < 0.45 && (z.kind === "city" || z.kind === "blackcity"))).map((z) => (
          <text key={`t${z.id}`} x={z.x + 5 * Math.max(scale, 0.35)} y={-z.y + 1.5} fontSize={9 * Math.max(scale, 0.4)} fill="currentColor" className="pointer-events-none text-foreground" paintOrder="stroke" stroke="#0a0d15" strokeWidth={2 * Math.max(scale, 0.4)}>{z.name}</text>
        ))}
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <Button size="icon" variant="secondary" aria-label="Aproximar" onClick={() => zoom(1 / 1.4)}><Plus className="size-4" /></Button>
        <Button size="icon" variant="secondary" aria-label="Afastar" onClick={() => zoom(1.4)}><span className="text-lg leading-none">−</span></Button>
        <Button size="icon" variant="secondary" aria-label="Ver tudo" onClick={() => setView(BOUNDS)}><RotateCcw className="size-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {(Object.keys(KIND_COLOR) as PlaceKind[]).filter((k) => k !== "road").map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]}</span>
        ))}
      </div>
    </div>
  );
}

const RES_LABEL: Record<string, string> = { FIBER: "Fibra", HIDE: "Couro", ORE: "Minério", ROCK: "Pedra", WOOD: "Madeira" };

function RoadCard({ road, onAdd }: { road: RoadZone; onAdd: (id: string) => void }) {
  const r = road.road;
  const res = Object.entries(r.resources);
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-bold">{road.name}</div>
          <div className="text-xs text-muted-foreground">Road of Avalon · {road.id}</div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onAdd(road.id)}><Plus className="mr-1 size-4" />Na rota</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {res.length === 0 && <span className="text-xs text-muted-foreground">Sem recursos registrados</span>}
        {res.map(([k, [lo, hi]]) => (
          <span key={k} className="rounded-full bg-card px-2 py-0.5 text-xs">{RES_LABEL[k] ?? k} T{lo}{hi !== lo ? `–T${hi}` : ""}</span>
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded bg-card p-1.5"><dt className="text-muted-foreground">Saídas</dt><dd className="text-sm font-bold">{r.exits}</dd></div>
        <div className="rounded bg-card p-1.5"><dt className="text-muted-foreground">Dungeons</dt><dd className="text-sm font-bold">{r.dungeons}</dd></div>
        <div className="rounded bg-card p-1.5"><dt className="text-muted-foreground">Baús</dt><dd className="text-sm font-bold">{r.chests}</dd></div>
        <div className="rounded bg-card p-1.5"><dt className="text-muted-foreground">Pesca</dt><dd className="text-sm font-bold">{r.fishing}</dd></div>
      </dl>
    </div>
  );
}

function RoadFinder({ onAdd }: { onAdd: (id: string) => void }) {
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  const results = useMemo(() => (q.length < 2 ? [] : searchPlaces(text, 40).filter((p): p is RoadZone => p.kind === "road").slice(0, 8)), [text]);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold">Roads of Avalon</h2>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">Busque a zona pelo nome ({ROADS.length} zonas) para ver recursos, saídas e dungeons. Use "Na rota" para colocá-la na sua rota manual.</p>
      <Input value={text} placeholder="Ex.: Ouyos-Aoeuam" onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 space-y-2">
        {q.length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma Road com esse nome.</p>}
        {results.map((r) => <RoadCard key={r.id} road={r} onAdd={onAdd} />)}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">As Roads não têm mapa de ligações: o jogo troca as conexões a cada 12–24 h. Aqui você consulta a zona e monta a sequência na mão.</p>
    </section>
  );
}

export function WorldMapView({ state, onChange }: { state: MapState; onChange: (s: MapState) => void }) {
  const { stops, mode, avoid, mount } = state;
  const filled = stops.filter((s) => placeById(s));
  const route = useMemo(
    () => (filled.length >= 2 ? planRoute(filled, { mode, avoid: new Set(avoid) }) : null),
    [filled.join(","), mode, avoid.join(",")],
  );
  const path = route?.path ?? [];
  const summary = useMemo(() => dangerSummary(path), [path]);
  const secs = estimateSeconds(path, mount);

  const set = (patch: Partial<MapState>) => onChange({ ...state, ...patch });
  const setStop = (i: number, id: string | undefined) => {
    const next = [...stops];
    while (next.length <= i) next.push("");
    next[i] = id ?? "";
    set({ stops: next });
  };
  const slots = Math.max(2, stops.length);
  const pick = (z: Zone) => {
    const next = [...stops];
    while (next.length < 2) next.push("");
    const empty = next.findIndex((s) => !placeById(s));
    if (empty >= 0) next[empty] = z.id; else next[next.length - 1] = z.id;
    set({ stops: next });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          {Array.from({ length: slots }, (_, i) => {
            const last = i === slots - 1;
            const label = i === 0 ? "Origem" : last ? "Destino" : `Parada ${i}`;
            return (
              <div key={i}>
                <ZonePicker label={label} value={stops[i] || undefined} onChange={(id) => setStop(i, id)}
                  {...(slots > 2 && i > 0 && !last ? { onRemove: () => set({ stops: stops.filter((_, j) => j !== i) }) } : {})} />
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={slots >= 8} onClick={() => { const s = [...stops]; while (s.length < 2) s.push(""); s.splice(s.length - 1, 0, ""); set({ stops: s }); }}>
              <Plus className="mr-1 size-4" />Adicionar parada
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={filled.length < 2} onClick={() => set({ stops: [...stops].reverse() })}>
              <ArrowDown className="mr-1 size-4" />Inverter
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Tipo de rota</Label>
            <Select value={mode} onValueChange={(v) => set({ mode: v as RouteMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rapida">Mais rápida (menos zonas)</SelectItem>
                <SelectItem value="segura">Mais segura (foge de zonas perigosas)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Montaria</Label>
            <Select value={mount} onValueChange={(v) => set({ mount: v as MountId })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MOUNTS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="block text-xs text-muted-foreground">Evitar</Label>
            {AVOIDABLE.map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]}s</span>
                <Switch checked={avoid.includes(k)} onCheckedChange={(on) => set({ avoid: on ? [...avoid, k] : avoid.filter((a) => a !== k) })} />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><RouteIcon className="size-5 text-primary" />Resumo</h2>
          {filled.length < 2 ? (
            <p className="text-sm text-muted-foreground">Escolha origem e destino, ou clique em duas zonas no mapa.</p>
          ) : !route ? (
            <p className="flex items-start gap-2 text-sm text-amber-400"><ShieldAlert className="mt-0.5 size-4 shrink-0" />Não achei caminho com essas opções. Tente desligar algum "Evitar", ou as zonas estão em partes do mapa ligadas só por portais.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-secondary p-2"><div className="text-xl font-extrabold">{path.length - 1}</div><div className="text-xs text-muted-foreground">saltos</div></div>
                <div className="rounded-lg bg-secondary p-2"><div className="text-xl font-extrabold">~{formatDuration(secs)}</div><div className="text-xs text-muted-foreground">estimado</div></div>
                <div className="rounded-lg bg-secondary p-2"><div className="text-xl font-extrabold">{summary.red + summary.black}</div><div className="text-xs text-muted-foreground">zonas de risco</div></div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {(Object.keys(summary) as PlaceKind[]).filter((k) => summary[k] > 0).map((k) => (
                  <span key={k} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: KIND_COLOR[k] }} />{summary[k]} {KIND_LABEL[k].toLowerCase()}</span>
                ))}
              </div>
              <ol className="max-h-72 space-y-1 overflow-auto pr-1 text-sm">
                {path.map((z, i) => (
                  <li key={`${z.id}-${i}`} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[z.kind] }} />
                    <span className={`min-w-0 flex-1 truncate ${stops.includes(z.id) ? "font-bold" : ""}`}>{z.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{z.kind === "road" ? "Road" : z.tier ? `T${z.tier}` : ""}</span>
                  </li>
                ))}
              </ol>
              {route.manual.some(Boolean) && <p className="text-xs text-teal-300">Trechos com Road of Avalon são ligações manuais: a ligação entre elas muda a cada 12–24 h, então o site só mostra a sequência que você montou.</p>}
              <p className="text-xs text-muted-foreground">Tempo aproximado: conta só o número de zonas, não a distância dentro de cada uma.</p>
            </div>
          )}
        </section>
      </div>
      <div className="min-w-0 space-y-6">
        <MapCanvas path={path} stops={filled} onPick={pick} />
        <RoadFinder onAdd={(id) => { const next = [...stops]; while (next.length < 2) next.push(""); const empty = next.findIndex((x) => !placeById(x)); if (empty >= 0) next[empty] = id; else next.splice(next.length - 1, 0, id); set({ stops: next }); }} />
      </div>
    </div>
  );
}
