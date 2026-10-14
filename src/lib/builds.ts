import { supabase } from "@/integrations/supabase/client";

export const BUILD_SLOTS = [
  { key: "weapon", label: "Arma", catalog: "weapon" },
  { key: "offhand", label: "Mão secundária", catalog: "offhand" },
  { key: "helmet", label: "Elmo", catalog: "helmet" },
  { key: "armor", label: "Armadura", catalog: "armor" },
  { key: "boots", label: "Bota", catalog: "boots" },
  { key: "cape", label: "Capa", catalog: "cape" },
  { key: "potion", label: "Poção", catalog: "potion" },
  { key: "food", label: "Comida", catalog: "food" },
  { key: "mount", label: "Montaria", catalog: "mount" },
] as const;

export type SlotKey = (typeof BUILD_SLOTS)[number]["key"];
export type GearSlot = Exclude<SlotKey, "weapon">;
export type Build = {
  id: string; owner_id: string; name: string; author_name: string | null; description: string | null;
  created_at: string; updated_at: string;
} & Record<SlotKey, string | null>;
export type BuildDraft = { name: string; author_name: string; description: string } & Record<SlotKey, string | null>;
export type GearItem = {
  id: string; slot: GearSlot; name: string; category: string | null; item_code: string;
  min_tier: number; max_tier: number; max_enchant: number; position: number;
};

export const SLOT_KEYS = BUILD_SLOTS.map((slot) => slot.key);
const BUILD_COLUMNS = ["id", "owner_id", "name", "author_name", "description", "created_at", "updated_at", ...SLOT_KEYS].join(",");

export const emptyBuildDraft = (): BuildDraft => ({
  name: "", author_name: "", description: "",
  weapon: null, helmet: null, armor: null, boots: null, cape: null, offhand: null, potion: null, food: null, mount: null,
});

/** "T8_HEAD_PLATE_SET1@2" -> { tier: 8, base: "HEAD_PLATE_SET1", enchant: 2 } */
export function parseGearCode(code: string) {
  const match = code.match(/^T([1-8])_(.+?)(?:@([1-4]))?$/);
  if (!match) return null;
  return { tier: Number(match[1]), base: match[2]!, enchant: Number(match[3] ?? 0) };
}
export function composeGearCode(base: string, tier: number, enchant: number) {
  return `T${tier}_${base}${enchant > 0 ? `@${enchant}` : ""}`;
}
/** Item nome-base (sem tier/encantamento), usado para casar com o catálogo. */
export const baseOf = (code: string) => parseGearCode(code)?.base ?? code;

export const itemIconUrl = (code: string, size = 128) =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(code)}.png?quality=1&size=${size}`;

export const tierLabel = (tier: number, enchant: number) => `T${tier}${enchant > 0 ? `.${enchant}` : ""}`;

export async function fetchGearCatalog(): Promise<GearItem[]> {
  const { data, error } = await supabase
    .from("gear_catalog")
    .select("id,slot,name,category,item_code,min_tier,max_tier,max_enchant,position")
    .order("position").order("name");
  if (error) throw error;
  return (data ?? []) as GearItem[];
}

export async function fetchBuilds(): Promise<Build[]> {
  const { data, error } = await supabase.from("builds").select(BUILD_COLUMNS).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Build[];
}

export async function fetchBuildsByIds(ids: string[]): Promise<Build[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("builds").select(BUILD_COLUMNS).in("id", ids);
  if (error) throw error;
  return (data ?? []) as unknown as Build[];
}

export function draftFromBuild(build: Build): BuildDraft {
  const draft = emptyBuildDraft();
  draft.name = build.name; draft.author_name = build.author_name ?? ""; draft.description = build.description ?? "";
  for (const key of SLOT_KEYS) draft[key] = build[key];
  return draft;
}

export function buildPayload(draft: BuildDraft) {
  return {
    name: draft.name.trim(),
    author_name: draft.author_name.trim() || null,
    description: draft.description.trim() || null,
    weapon: draft.weapon, helmet: draft.helmet, armor: draft.armor, boots: draft.boots, cape: draft.cape,
    offhand: draft.offhand, potion: draft.potion, food: draft.food, mount: draft.mount,
  };
}

export function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
