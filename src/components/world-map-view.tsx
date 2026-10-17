import { useMemo, useRef, useState } from "react";
import { ArrowDown, Plus, RotateCcw, Route as RouteIcon, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EDGES, KIND_COLOR, KIND_LABEL, MOUNTS, ZONES, dangerSummary, estimateSeconds, formatDuration, planRoute, searchZones, zoneById,
  type MountId, type RouteMode, type Zone, type ZoneKind,
} from "@/lib/world-map";

export type MapState = { stops: string[]; mode: RouteMode; avoid: ZoneKind[]; mount: MountId };

const AVOIDABLE: ZoneKind[] = ["red", "black", "yellow"];

function ZonePicker({ label, value, onChange, onRemove }: { label: string; value: string | undefined; onChange: (id: string | undefined) => void; onRemove?: () => void }) {
  const zone = zoneById(value);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchZones(text), [text]);
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

/**
 * Fundo do mundo (512x1024 px). Ajuste das posições do grafo para pixels: px = 0.73·x + 254, py = 0.73·(−y) + 506.
 * Em unidades do mapa, a imagem começa em (−254/0.73, −506/0.73) e mede 512/0.73 × 1024/0.73.
 */
const WORLD_IMG = { href: "/albion-world-map.webp", x: -254 / 0.73, y: -506 / 0.73, w: 512 / 0.73, h: 1024 / 0.73 };

const BOUNDS = (() => {
  const xs = ZONES.map((z) => z.x), ys = ZONES.map((z) => -z.y);
  const pad = 20;
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
})();

const STEP_HINT = [
  "Clique numa zona para definir a ORIGEM",
  "Agora clique na zona de DESTINO",
  "Rota pronta. Clique em outra zona para começar uma nova",
];

function MapCanvas({ path, stops, step, onPick, onReset }: { path: Zone[]; stops: string[]; step: number; onPick: (z: Zone) => void; onReset: () => void }) {
  const originId = stops[0];
  const destId = stops.length > 1 ? stops[stops.length - 1] : undefined;
  const [hover, setHover] = useState<Zone | null>(null);
  const [view, setView] = useState(BOUNDS);
  const drag = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const onRoute = useMemo(() => new Set(path.map((z) => z.id)), [path]);
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
      <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{step + 1 > 2 ? "✓" : step + 1}</span>
          <span className="truncate font-medium">{STEP_HINT[step]}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
          {originId && <span className="flex items-center gap-1"><span className="size-2.5 rounded-full ring-2 ring-emerald-400" />{zoneById(originId)?.name}</span>}
          {destId && <span className="flex items-center gap-1"><span className="size-2.5 rounded-full ring-2 ring-amber-400" />{zoneById(destId)?.name}</span>}
          {stops.length > 0 && <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onReset}>Limpar</Button>}
        </span>
      </div>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-[70vh] min-h-[420px] w-full touch-none select-none"
        onWheel={(e) => { const p = toMap(e); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y); }}
        onPointerDown={(e) => { drag.current = { px: e.clientX, py: e.clientY, moved: false }; moved.current = false; (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const r = svg.current!.getBoundingClientRect();
          const dx = ((e.clientX - d.px) / r.width) * view.w, dy = ((e.clientY - d.py) / r.height) * view.h;
          if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 3) d.moved = true;
          if (d.moved) { moved.current = true; setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy })); d.px = e.clientX; d.py = e.clientY; }
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <image href={WORLD_IMG.href} x={WORLD_IMG.x} y={WORLD_IMG.y} width={WORLD_IMG.w} height={WORLD_IMG.h} preserveAspectRatio="none" opacity={0.95} />
        <rect x={WORLD_IMG.x} y={WORLD_IMG.y} width={WORLD_IMG.w} height={WORLD_IMG.h} fill="#0a0d15" opacity={path.length ? 0.35 : 0.12} pointerEvents="none" />
        <g stroke="#ffffff" strokeWidth={0.6 * Math.max(scale, 0.3)} opacity={path.length ? 0.22 : 0.5}>
          {EDGES.map(([a, b], i) => <line key={i} x1={ZONES[a]!.x} y1={-ZONES[a]!.y} x2={ZONES[b]!.x} y2={-ZONES[b]!.y} />)}
        </g>
        {path.length > 1 && (
          <polyline points={path.map((z) => `${z.x},${-z.y}`).join(" ")} fill="none" stroke="#6db6ff" strokeWidth={2.2 * Math.max(scale, 0.35)} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {ZONES.map((z) => {
          const big = z.kind === "city" || z.kind === "blackcity";
          const isStop = stops.includes(z.id);
          const ring = z.id === originId ? "#34d399" : z.id === destId ? "#fbbf24" : isStop ? "#fff" : "none";
          const r = (isStop ? 4.8 : onRoute.has(z.id) ? 3.2 : big ? 3 : 2) * Math.max(scale, 0.35);
          return (
            <circle key={z.id} cx={z.x} cy={-z.y} r={r} fill={KIND_COLOR[z.kind]} stroke={isStop ? ring : "#0a0d15"} strokeWidth={(isStop ? 1.8 : 0.6) * Math.max(scale, 0.35)}
              onPointerEnter={() => setHover(z)} onPointerLeave={() => setHover((h) => (h?.id === z.id ? null : h))}
              className="cursor-pointer" onClick={() => { if (!moved.current) onPick(z); }}>
              <title>{z.name} — {KIND_LABEL[z.kind]}{z.tier ? ` T${z.tier}` : ""}</title>
            </circle>
          );
        })}
        {ZONES.filter((z) => onRoute.has(z.id) || stops.includes(z.id) || hover?.id === z.id || (scale < 0.45 && (z.kind === "city" || z.kind === "blackcity"))).map((z) => (
          <text key={`t${z.id}`} x={z.x + 5 * Math.max(scale, 0.35)} y={-z.y + 1.5} fontSize={9 * Math.max(scale, 0.4)} fill="currentColor" className="pointer-events-none text-foreground" paintOrder="stroke" stroke="#0a0d15" strokeWidth={2 * Math.max(scale, 0.4)}>{z.name}</text>
        ))}
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <Button size="icon" variant="secondary" aria-label="Aproximar" onClick={() => zoom(1 / 1.4)}><Plus className="size-4" /></Button>
        <Button size="icon" variant="secondary" aria-label="Afastar" onClick={() => zoom(1.4)}><span className="text-lg leading-none">−</span></Button>
        <Button size="icon" variant="secondary" aria-label="Ver tudo" onClick={() => setView(BOUNDS)}><RotateCcw className="size-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {(Object.keys(KIND_COLOR) as ZoneKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]}</span>
        ))}
      </div>
    </div>
  );
}

export function WorldMapView({ state, onChange }: { state: MapState; onChange: (s: MapState) => void }) {
  const { stops, mode, avoid, mount } = state;
  const filled = stops.filter((s) => zoneById(s));
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
  // 1º clique = origem, 2º clique = destino, 3º clique começa uma rota nova.
  const pick = (z: Zone) => {
    if (filled.length === 0) set({ stops: [z.id, ""] });
    else if (filled.length === 1) { if (filled[0] !== z.id) set({ stops: [filled[0]!, z.id] }); }
    else set({ stops: [z.id, ""] });
  };
  const step = filled.length === 0 ? 0 : filled.length === 1 ? 1 : 2;

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
                {(Object.keys(summary) as ZoneKind[]).filter((k) => summary[k] > 0).map((k) => (
                  <span key={k} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: KIND_COLOR[k] }} />{summary[k]} {KIND_LABEL[k].toLowerCase()}</span>
                ))}
              </div>
              <ol className="max-h-72 space-y-1 overflow-auto pr-1 text-sm">
                {path.map((z, i) => (
                  <li key={`${z.id}-${i}`} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[z.kind] }} />
                    <span className={`min-w-0 flex-1 truncate ${stops.includes(z.id) ? "font-bold" : ""}`}>{z.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{z.tier ? `T${z.tier}` : ""}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">Tempo aproximado: conta só o número de zonas, não a distância dentro de cada uma.</p>
            </div>
          )}
        </section>
      </div>
      <MapCanvas path={path} stops={filled} step={step} onPick={pick} onReset={() => set({ stops: [] })} />
    </div>
  );
}
