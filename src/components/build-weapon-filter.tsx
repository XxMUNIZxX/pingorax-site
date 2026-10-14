import { baseOf, itemIconUrl } from "@/lib/builds";
import type { CatalogWeapon } from "@/lib/weapon-catalog";

// Arma "de capa" de cada família, para o ícone do filtro (se não existir, usa a primeira da categoria).
const REPRESENTATIVE: Record<string, string> = {
  Espadas: "T8_MAIN_SWORD", Machados: "T8_MAIN_AXE", "Maças": "T8_MAIN_MACE", Martelos: "T8_MAIN_HAMMER",
  "Lanças": "T8_MAIN_SPEAR", "Bastões": "T8_2H_QUARTERSTAFF", Adagas: "T8_MAIN_DAGGER", Luvas: "T8_2H_KNUCKLES_SET1",
  Arcos: "T8_2H_BOW", Bestas: "T8_2H_CROSSBOW", Fogo: "T8_MAIN_FIRESTAFF", Gelo: "T8_MAIN_FROSTSTAFF",
  Arcano: "T8_MAIN_ARCANESTAFF", Sagrado: "T8_MAIN_HOLYSTAFF", Natureza: "T8_MAIN_NATURESTAFF",
  "Amaldiçoado": "T8_MAIN_CURSEDSTAFF", Metamorfo: "T8_2H_SHAPESHIFTER_SET1",
};
export const NO_CATEGORY = "Outras";

export type WeaponGroup = { category: string; icon: string; weapons: CatalogWeapon[] };

export function groupWeapons(catalog: CatalogWeapon[]): WeaponGroup[] {
  const map = new Map<string, CatalogWeapon[]>();
  for (const weapon of catalog) {
    const key = weapon.category || NO_CATEGORY;
    map.set(key, [...(map.get(key) ?? []), weapon]);
  }
  return [...map.entries()].map(([category, weapons]) => {
    const preferred = REPRESENTATIVE[category];
    const rep = weapons.find((w) => w.item_code === preferred) ?? weapons[0]!;
    return { category, icon: rep.item_code, weapons };
  });
}

type Props = {
  groups: WeaponGroup[];
  counts: { byCategory: Map<string, number>; byWeapon: Map<string, number>; total: number };
  category: string | null;
  weapon: string | null; // base do item
  onCategory: (category: string | null) => void;
  onWeapon: (base: string | null) => void;
};

export function BuildWeaponFilter({ groups, counts, category, weapon, onCategory, onWeapon }: Props) {
  const active = groups.find((g) => g.category === category);
  return (
    <section aria-label="Procurar por arma">
      <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Procurar por arma</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-9">
        <button type="button" aria-pressed={category === null} onClick={() => onCategory(null)}
          className={`flex flex-col items-center justify-center rounded-md border p-2 text-xs font-medium hover:border-primary ${category === null ? "border-primary bg-secondary ring-2 ring-primary" : "border-border bg-card"}`}>
          <span className="text-lg font-bold text-gold">{counts.total}</span>Todas
        </button>
        {groups.map((group) => {
          const on = group.category === category;
          const n = counts.byCategory.get(group.category) ?? 0;
          return (
            <button key={group.category} type="button" aria-pressed={on} onClick={() => onCategory(on ? null : group.category)} title={`${group.category} (${n})`}
              className={`relative flex flex-col items-center rounded-md border p-1.5 text-xs hover:border-primary ${on ? "border-primary bg-secondary ring-2 ring-primary" : "border-border bg-card"} ${n === 0 ? "opacity-60" : ""}`}>
              <img src={itemIconUrl(group.icon, 96)} alt="" loading="lazy" className="h-12 w-12 object-contain" />
              <span className="mt-0.5 w-full truncate text-center">{group.category}</span>
              {n > 0 && <span className="absolute right-1 top-1 rounded bg-background/80 px-1 text-[10px] font-bold text-gold">{n}</span>}
            </button>
          );
        })}
      </div>
      {active && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Armas de ${active.category}`}>
          <button type="button" aria-pressed={weapon === null} onClick={() => onWeapon(null)}
            className={`rounded-full border px-3 py-1 text-xs hover:border-primary ${weapon === null ? "border-primary bg-secondary" : "border-border"}`}>Todas de {active.category}</button>
          {active.weapons.map((w) => {
            const base = baseOf(w.item_code);
            const n = counts.byWeapon.get(base) ?? 0;
            return (
              <button key={w.id} type="button" aria-pressed={weapon === base} onClick={() => onWeapon(weapon === base ? null : base)}
                className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-3 text-xs hover:border-primary ${weapon === base ? "border-primary bg-secondary" : "border-border"} ${n === 0 ? "opacity-60" : ""}`}>
                <img src={itemIconUrl(w.item_code, 48)} alt="" loading="lazy" className="h-7 w-7 object-contain" />
                {w.name}{n > 0 && <span className="font-bold text-gold">{n}</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
