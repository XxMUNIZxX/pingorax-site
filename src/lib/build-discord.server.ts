import { publicShareClient } from "@/lib/share-image.server";
import { SHARE_ORIGIN } from "@/lib/share-image";
import { serverEnv } from "@/lib/server-env";
import type { ImageBuild, ImageGroupMember } from "@/lib/build-image.server";

// Builds e grupos são públicos para leitura no banco, então o bot lê com a chave pública, igual aos conteúdos.
function client() {
  const url = serverEnv("SUPABASE_URL"); const key = serverEnv("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Servidor sem SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.");
  return publicShareClient(url, key);
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const safe = (text: string) => text.replace(/[\\*_`~|>@#<\[\]()]/g, "\\$&");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BUILD_COLUMNS = "id,name,author_name,description,content_type,weapon,offhand,helmet,armor,boots,cape,potion,food,mount";
type BuildRow = ImageBuild & { id: string; description: string | null };
type GroupRow = { id: string; name: string; author_name: string | null; description: string | null; content_type: string | null; build_group_members: { build_id: string; role: string | null; quantity: number; position: number }[] | null };

export type BuildRef = { kind: "b" | "g"; id: string };
export const parseRef = (raw: string): BuildRef | null => {
  const m = raw.trim().toLowerCase().match(/^([bg]):([0-9a-f-]{36})$/);
  return m && UUID.test(m[2]!) ? { kind: m[1] as "b" | "g", id: m[2]! } : null;
};
export const refImageUrl = (ref: BuildRef) => `${SHARE_ORIGIN}/api/public/build-image?t=${ref.kind}&id=${ref.id}&v=${Math.floor(Date.now() / 60000)}`;

/** Escapa os curingas do LIKE para o texto digitado ser buscado como está. */
const likePattern = (query: string) => `%${query.replace(/[\\%_,()]/g, " ").trim()}%`;

/** Opções do autocomplete do /build: grupos e builds cujo nome contém o texto digitado (ou os mais recentes). */
export async function searchBuilds(query: string): Promise<{ name: string; value: string }[]> {
  const db = client();
  const q = query.trim();
  let groups = db.from("build_groups").select("id,name").order("created_at", { ascending: false }).limit(12);
  let builds = db.from("builds").select("id,name,author_name").order("created_at", { ascending: false }).limit(13);
  if (q) { groups = groups.ilike("name", likePattern(q)); builds = builds.ilike("name", likePattern(q)); }
  const [g, b] = await Promise.all([groups, builds]);
  return [
    ...(g.data ?? []).map((row) => ({ name: clip(`Grupo: ${row.name}`, 100), value: `g:${row.id}` })),
    ...(b.data ?? []).map((row) => ({ name: clip(row.author_name ? `${row.name} (${row.author_name})` : row.name, 100), value: `b:${row.id}` })),
  ].slice(0, 25);
}

/** Resolve o que veio do comando: uma opção do autocomplete ou um nome digitado à mão. */
export async function resolveRef(raw: string): Promise<BuildRef | null> {
  const direct = parseRef(raw);
  if (direct) return direct;
  const found = await searchBuilds(raw.replace(/^grupo:\s*/i, ""));
  const wanted = raw.trim().toLowerCase();
  const exact = found.find((o) => o.name.toLowerCase().replace(/^grupo:\s*/, "") === wanted.replace(/^grupo:\s*/, ""));
  return parseRef((exact ?? found[0])?.value ?? "");
}

export async function loadBuild(id: string): Promise<BuildRow | null> {
  const { data, error } = await client().from("builds").select(BUILD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as BuildRow | null) ?? null;
}

export async function loadGroup(id: string): Promise<{ group: GroupRow; members: (ImageGroupMember & { buildId: string })[] } | null> {
  const db = client();
  const { data, error } = await db.from("build_groups").select("id,name,author_name,description,content_type,build_group_members(build_id,role,quantity,position)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const group = data as unknown as GroupRow;
  const rows = [...(group.build_group_members ?? [])].sort((a, b) => a.position - b.position);
  const { data: builds, error: buildsError } = rows.length ? await db.from("builds").select(BUILD_COLUMNS).in("id", rows.map((r) => r.build_id)) : { data: [], error: null };
  if (buildsError) throw buildsError;
  const byId = new Map(((builds ?? []) as unknown as BuildRow[]).map((b) => [b.id, b]));
  const members = rows.flatMap((r) => { const build = byId.get(r.build_id); return build ? [{ buildId: r.build_id, role: r.role, quantity: r.quantity, build }] : []; });
  return { group, members };
}

/** Nome de cada item pelo código, usando os catálogos do site. */
export async function itemNames(): Promise<(code: string) => string> {
  const db = client();
  const [weapons, gear] = await Promise.all([db.from("weapon_catalog").select("item_code,name"), db.from("gear_catalog").select("item_code,name")]);
  const base = (code: string) => code.replace(/^T[1-8]_/, "").replace(/@[1-4]$/, "");
  const names = new Map<string, string>();
  for (const row of [...(weapons.data ?? []), ...(gear.data ?? [])]) names.set(base(row.item_code), row.name);
  return (code) => names.get(base(code)) ?? base(code).replace(/_/g, " ").toLowerCase();
}

export type BuildMessage = { embeds: object[]; allowed_mentions: { parse: string[] } };

/** Mensagem do /build: título, quem fez e a imagem. Devolve null quando não existe. */
export async function buildMessage(ref: BuildRef): Promise<BuildMessage | null> {
  const url = `${SHARE_ORIGIN}/builds`;
  if (ref.kind === "b") {
    const build = await loadBuild(ref.id);
    if (!build) return null;
    const meta = [build.author_name && `por **${safe(build.author_name)}**`, build.content_type && safe(build.content_type)].filter(Boolean).join(" · ");
    return { embeds: [{
      title: clip(build.name, 256), url, color: 0x6db6ff,
      description: clip([meta, build.description && safe(build.description)].filter(Boolean).join("\n"), 1000) || undefined,
      image: { url: refImageUrl(ref) }, footer: { text: "Build · PingoraX" },
    }], allowed_mentions: { parse: [] } };
  }
  const loaded = await loadGroup(ref.id);
  if (!loaded) return null;
  const { group, members } = loaded;
  const players = members.reduce((sum, m) => sum + m.quantity, 0);
  const lines = members.slice(0, 20).map((m) => `**${m.quantity}x** ${m.role ? `${safe(m.role)} — ` : ""}${safe(m.build.name)}`);
  const meta = [group.author_name && `por **${safe(group.author_name)}**`, group.content_type && safe(group.content_type), `${members.length} ${members.length === 1 ? "build" : "builds"} · ${players} ${players === 1 ? "jogador" : "jogadores"}`].filter(Boolean).join(" · ");
  return { embeds: [{
    title: clip(group.name, 256), url, color: 0x6db6ff,
    description: clip([meta, group.description && safe(group.description), "", ...lines].filter((l) => l !== null && l !== undefined && l !== false).join("\n"), 3500),
    image: { url: refImageUrl(ref) }, footer: { text: "Grupo de builds · PingoraX" },
  }], allowed_mentions: { parse: [] } };
}
