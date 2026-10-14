import { useQuery } from "@tanstack/react-query";
import { ItemSlot } from "@/components/item-slot";
import { BUILD_SLOTS, baseOf, fetchGearCatalog, type SlotKey } from "@/lib/builds";
import { fetchWeaponCatalog } from "@/lib/weapon-catalog";

/** Nome de qualquer item (arma ou equipamento) pelo código, usando os catálogos. */
export function useItemNames() {
  const weapons = useQuery({ queryKey: ["weapon-catalog"], queryFn: fetchWeaponCatalog, staleTime: 60_000 });
  const gear = useQuery({ queryKey: ["gear-catalog"], queryFn: fetchGearCatalog, staleTime: 60_000 });
  const names = new Map<string, string>();
  for (const w of weapons.data ?? []) names.set(baseOf(w.item_code), w.name);
  for (const g of gear.data ?? []) names.set(baseOf(g.item_code), g.name);
  return (code: string) => names.get(baseOf(code)) ?? baseOf(code).replace(/_/g, " ").toLowerCase();
}

// Mesma disposição do inventário do jogo: cabeça no meio, arma à esquerda, mão secundária à direita...
const LAYOUT: (SlotKey | null)[][] = [
  [null, "helmet", "cape"],
  ["weapon", "armor", "offhand"],
  ["potion", "boots", "food"],
  [null, "mount", null],
];

export function SlotCell({ slotKey, code, name, size = 72, onClick }: { slotKey: SlotKey; code: string | null; name?: string; size?: number; onClick?: () => void }) {
  const label = BUILD_SLOTS.find((slot) => slot.key === slotKey)?.label ?? slotKey;
  const inner = (
    <>
      <ItemSlot code={code} label={label} size={size} />
      <span className={`mt-1.5 line-clamp-2 w-full text-center text-xs leading-tight ${code ? "text-foreground" : "text-muted-foreground"}`}>{code && name ? name : label}</span>
    </>
  );
  const cls = "flex min-w-0 flex-col items-center rounded-lg p-1";
  return onClick
    ? <button type="button" onClick={onClick} aria-label={`${label}: ${code ? name : "vazio"}`} className={`${cls} transition hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}>{inner}</button>
    : <div className={cls} title={label}>{inner}</div>;
}

export function BuildGear({ build, size, onPick }: { build: Partial<Record<SlotKey, string | null>>; size?: number; onPick?: (slot: SlotKey) => void }) {
  const nameOf = useItemNames();
  return (
    <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-gradient-to-b from-background/60 to-background/20 p-3 shadow-inner">
      {LAYOUT.flat().map((key, i) => key
        ? <SlotCell key={key} slotKey={key} code={build[key] ?? null} name={build[key] ? nameOf(build[key]!) : undefined} size={size ?? 72} {...(onPick ? { onClick: () => onPick(key) } : {})} />
        : <div key={`gap-${i}`} aria-hidden />)}
    </div>
  );
}
