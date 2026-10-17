import world from "@/data/albion-world.json";
import roadsData from "@/data/albion-roads.json";

export type ZoneKind = "city" | "blue" | "yellow" | "red" | "black" | "blackcity";
export type Zone = { id: string; name: string; kind: ZoneKind; tier: number; x: number; y: number };

export type PlaceKind = ZoneKind | "road";

export const KIND_LABEL: Record<PlaceKind, string> = {
  city: "Cidade",
  blue: "Zona azul",
  yellow: "Zona amarela",
  red: "Zona vermelha",
  black: "Zona preta",
  blackcity: "Cidade das Roads/Outlands",
  road: "Road of Avalon",
};
export const KIND_COLOR: Record<PlaceKind, string> = {
  city: "#6db6ff",
  blue: "#4f8fe0",
  yellow: "#e8c33c",
  red: "#e5484d",
  black: "#9aa0b4",
  blackcity: "#c084fc",
  road: "#2dd4bf",
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

export type RoadInfo = {
  /** Recursos por tipo: [tier mínimo, tier máximo]. */
  resources: Record<string, [number, number]>;
  exits: number;
  dungeons: number;
  chests: number;
  fishing: number;
};
export type RoadZone = { id: string; name: string; kind: "road"; tier: 0; road: RoadInfo };
export type Place = Zone | RoadZone;

type RawRoads = { roads: [string, string, Record<string, [number, number]>, [number, number, number, number]][] };
export const ROADS: RoadZone[] = (roadsData as unknown as RawRoads).roads.map(([id, name, resources, c]) => ({
  id, name, kind: "road", tier: 0, road: { resources, exits: c[0], dungeons: c[1], chests: c[2], fishing: c[3] },
}));
const ROAD_INDEX = new Map(ROADS.map((r) => [r.id, r]));
export const isGraphZone = (p: Place): p is Zone => p.kind !== "road";

export function placeById(id: string | undefined): Place | undefined {
  if (id === undefined) return undefined;
  return zoneById(id) ?? ROAD_INDEX.get(id);
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

const ROAD_NAMES = ROADS.map((r) => norm(r.name));

/** Busca em zonas normais e em Roads of Avalon pelo nome. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = norm(query.trim());
  if (!q) return [];
  const starts: Place[] = [];
  const has: Place[] = [];
  for (let i = 0; i < ZONES.length; i++) {
    const n = NAMES[i]!;
    if (n.startsWith(q)) starts.push(ZONES[i]!);
    else if (n.includes(q) || ZONES[i]!.id === q) has.push(ZONES[i]!);
  }
  for (let i = 0; i < ROADS.length; i++) {
    const n = ROAD_NAMES[i]!;
    if (n.startsWith(q)) starts.push(ROADS[i]!);
    else if (n.includes(q) || norm(ROADS[i]!.id) === q) has.push(ROADS[i]!);
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

/**
 * Rota por várias paradas na ordem dada. Trechos entre duas zonas do mapa normal usam o menor caminho;
 * trechos que envolvem uma Road of Avalon são ligações manuais (as Roads mudam de ligação e não têm grafo).
 */
export function planRoute(stopIds: string[], opt: RouteOptions): { path: Place[]; legs: Place[][]; manual: boolean[] } | null {
  const legs: Place[][] = [];
  const manual: boolean[] = [];
  for (let i = 0; i + 1 < stopIds.length; i++) {
    const a = placeById(stopIds[i]);
    const b = placeById(stopIds[i + 1]);
    if (!a || !b) return null;
    if (isGraphZone(a) && isGraphZone(b)) {
      const leg = findPath(a.id, b.id, opt);
      if (!leg) return null;
      legs.push(leg);
      manual.push(false);
    } else {
      legs.push([a, b]);
      manual.push(true);
    }
  }
  const path = legs.flatMap((l, i) => (i === 0 ? l : l.slice(1)));
  return { path, legs, manual };
}

export const MOUNTS = [
  { id: "pe", label: "A pé", seconds: 75 },
  { id: "lenta", label: "Montaria lenta (T3–T4)", seconds: 50 },
  { id: "media", label: "Montaria média (T5–T6)", seconds: 38 },
  { id: "rapida", label: "Montaria rápida (T7–T8)", seconds: 28 },
] as const;
export type MountId = (typeof MOUNTS)[number]["id"];

/** Estimativa grosseira: segundos por zona atravessada. Não leva em conta a distância dentro de cada zona. */
export function estimateSeconds(path: Place[], mount: MountId): number {
  const per = MOUNTS.find((m) => m.id === mount)?.seconds ?? 38;
  return Math.max(0, path.length - 1) * per;
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function dangerSummary(path: Place[]): Record<PlaceKind, number> {
  const c: Record<PlaceKind, number> = { city: 0, blue: 0, yellow: 0, red: 0, black: 0, blackcity: 0, road: 0 };
  for (const z of path) c[z.kind]++;
  return c;
}
