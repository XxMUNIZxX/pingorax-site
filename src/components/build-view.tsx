import { useQuery } from "@tanstack/react-query";
import { BUILD_SLOTS, baseOf, fetchGearCatalog, itemIconUrl, parseGearCode, tierLabel, type SlotKey } from "@/lib/builds";
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
  const parsed = code ? parseGearCode(code) : null;
  const inner = (
    <>
      <span className="relative flex w-full items-center justify-center" style={{ height: size }}>
        {code ? <img src={itemIconUrl(code, 128)} alt={name ?? label} loading="lazy" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">{label}</span>}
        {parsed && <span className="absolute bottom-0 right-0 rounded bg-background/80 px-1 text-xs font-bold text-gold">{tierLabel(parsed.tier, parsed.enchant)}</span>}
      </span>
      {code && name && <span className="mt-1 line-clamp-2 w-full text-center text-xs leading-tight">{name}</span>}
    </>
  );
  const cls = "flex min-w-0 flex-col items-center rounded-md border border-border bg-card p-1.5";
  return onClick
    ? <button type="button" onClick={onClick} aria-label={`${label}: ${code ? name : "vazio"}`} className={`${cls} hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}>{inner}</button>
    : <div className={cls} title={label}>{inner}</div>;
}

export function BuildGear({ build, size, onPick }: { build: Partial<Record<SlotKey, string | null>>; size?: number; onPick?: (slot: SlotKey) => void }) {
  const nameOf = useItemNames();
  return (
    <div className="grid grid-cols-3 gap-2">
      {LAYOUT.flat().map((key, i) => key
        ? <SlotCell key={key} slotKey={key} code={build[key] ?? null} name={build[key] ? nameOf(build[key]!) : undefined} size={size ?? 72} {...(onPick ? { onClick: () => onPick(key) } : {})} />
        : <div key={`gap-${i}`} aria-hidden />)}
    </div>
  );
}
