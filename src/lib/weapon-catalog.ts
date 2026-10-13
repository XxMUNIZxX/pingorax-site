import { supabase } from "@/integrations/supabase/client";

export type CatalogWeapon = { id: string; name: string; category: string | null; item_code: string; position: number };

export const catalogIconUrl = (code: string) => `https://render.albiononline.com/v1/item/${encodeURIComponent(code)}.png?quality=1`;

export async function fetchWeaponCatalog(): Promise<CatalogWeapon[]> {
  const { data, error } = await supabase.from("weapon_catalog").select("id,name,category,item_code,position").order("position").order("name");
  if (error) throw error;
  return data ?? [];
}

/** Accepts a raw item code or a full render.albiononline.com link. */
export function parseItemCode(value: string): string | null {
  const v = value.trim();
  const match = v.match(/render\.albiononline\.com\/v1\/item\/([^/?#]+?)(?:\.png)?(?:[?#]|$)/i);
  const code = match ? decodeURIComponent(match[1]!) : v;
  return /^[A-Za-z0-9_@]{2,80}$/.test(code) ? code : null;
}

export function searchCatalog(list: CatalogWeapon[], query: string) {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = norm(query.trim());
  if (!q) return list;
  return list.filter((w) => norm(`${w.name} ${w.category ?? ""} ${w.item_code}`).includes(q));
}
