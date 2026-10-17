import world from "@/data/albion-world.json";

export type ZoneKind = "city" | "blue" | "yellow" | "red" | "black" | "blackcity";
export type Zone = { id: string; name: string; kind: ZoneKind; tier: number; x: number; y: number };

export const KIND_LABEL: Record<ZoneKind, string> = {
  city: "Cidade",
  blue: "Zona azul",
  yellow: "Zona amarela",
  red: "Zona vermelha",
  black: "Zona preta",
  blackcity: "Cidade das Roads/Outlands",
};
export const KIND_COLOR: Record<ZoneKind, string> = {
  city: "#6db6ff",
  blue: "#4f8fe0",
  yellow: "#e8c33c",
  red: "#e5484d",
  black: "#9aa0b4",
  blackcity: "#c084fc",
};
/** Perigo de cada tipo de zona: 0 = segura. */
const DANGER: Record<ZoneKind, number> = { city: 0, blue: 0, yellow: 2, red: 8, black: 12, blackcity: 6 };

type Raw = { nodes: [string, string, ZoneKind, number, number, number][]; edges: [number, number][] };
const raw = world as unknown as Raw;

export const ZONES: Zone[] = raw.nodes.map(([id, name, kind, tier, x, y]) => ({ id, name, kind, tier, x, y }));
const INDEX = new Map(ZONES.map((z, i) => [z.id, i]));
export const EDGES: [number, number][] = raw.edges;
const ADJ: number[][] = ZONES.map(() => []);
for (const [a, b] of EDGES) {
  ADJ[a]?.push(b);
  ADJ[b]?.push(a);
}

export function zoneById(id: string | undefined): Zone | undefined {
  const i = id === undefined ? undefined : INDEX.get(id);
  return i === undefined ? undefined : ZONES[i];
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
const NAMES = ZONES.map((z) => norm(z.name));

/** Busca por nome: começa com o texto primeiro, depois contém. */
export function searchZones(query: string, limit = 8): Zone[] {
  const q = norm(query.trim());
  if (!q) return [];
  const starts: Zone[] = [];
  const has: Zone[] = [];
  for (let i = 0; i < ZONES.length; i++) {
    const n = NAMES[i]!;
    const z = ZONES[i]!;
    if (n.startsWith(q)) starts.push(z);
    else if (n.includes(q) || z.id === q) has.push(z);
  }
  return [...starts, ...has].slice(0, limit);
}

export type RouteMode = "rapida" | "segura";
export type RouteOptions = { mode: RouteMode; avoid: ReadonlySet<ZoneKind> };

/** Menor caminho (Dijkstra) entre duas zonas. Zonas evitadas ficam fora, exceto origem e destino. */
export function findPath(fromId: string, toId: string, opt: RouteOptions): Zone[] | null {
  const s = INDEX.get(fromId);
  const t = INDEX.get(toId);
  if (s === undefined || t === undefined) return null;
  if (s === t) return [ZONES[s]!];
  const n = ZONES.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[s] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < best) { best = dist[i]!; u = i; }
    if (u === -1 || u === t) break;
    done[u] = true;
    for (const v of ADJ[u]!) {
      const z = ZONES[v]!;
      if (v !== t && opt.avoid.has(z.kind)) continue;
      const cost = 1 + (opt.mode === "segura" ? DANGER[z.kind] : 0);
      if (dist[u]! + cost < dist[v]!) { dist[v] = dist[u]! + cost; prev[v] = u; }
    }
  }
  if (prev[t] === -1) return null;
  const out: Zone[] = [];
  for (let c = t; c !== -1; c = prev[c]!) out.push(ZONES[c]!);
  return out.reverse();
}

/** Rota por várias paradas na ordem dada. Retorna null se algum trecho não tiver caminho. */
export function planRoute(stopIds: string[], opt: RouteOptions): { path: Zone[]; legs: Zone[][] } | null {
  const legs: Zone[][] = [];
  for (let i = 0; i + 1 < stopIds.length; i++) {
    const leg = findPath(stopIds[i]!, stopIds[i + 1]!, opt);
    if (!leg) return null;
    legs.push(leg);
  }
  const path = legs.flatMap((l, i) => (i === 0 ? l : l.slice(1)));
  return { path, legs };
}

export const MOUNTS = [
  { id: "pe", label: "A pé", seconds: 75 },
  { id: "lenta", label: "Montaria lenta (T3–T4)", seconds: 50 },
  { id: "media", label: "Montaria média (T5–T6)", seconds: 38 },
  { id: "rapida", label: "Montaria rápida (T7–T8)", seconds: 28 },
] as const;
export type MountId = (typeof MOUNTS)[number]["id"];

/** Estimativa grosseira: segundos por zona atravessada. Não leva em conta a distância dentro de cada zona. */
export function estimateSeconds(path: Zone[], mount: MountId): number {
  const per = MOUNTS.find((m) => m.id === mount)?.seconds ?? 38;
  return Math.max(0, path.length - 1) * per;
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function dangerSummary(path: Zone[]): Record<ZoneKind, number> {
  const c: Record<ZoneKind, number> = { city: 0, blue: 0, yellow: 0, red: 0, black: 0, blackcity: 0 };
  for (const z of path) c[z.kind]++;
  return c;
}
