import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUILD_SLOTS, composeGearCode, fetchGearCatalog, itemIconUrl, normalize, parseGearCode, tierLabel, type SlotKey } from "@/lib/builds";
import { fetchWeaponCatalog } from "@/lib/weapon-catalog";

type PickItem = { key: string; name: string; category: string | null; base: string; iconTier: number; minTier: number; maxTier: number; maxEnchant: number };

export function BuildSlotPicker({ slot, current, onClose, onChange }: { slot: SlotKey | null; current: string | null; onClose: () => void; onChange: (code: string | null) => void }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PickItem | null>(null);
  const [tier, setTier] = useState(8);
  const [enchant, setEnchant] = useState(0);
  const weapons = useQuery({ queryKey: ["weapon-catalog"], queryFn: fetchWeaponCatalog, enabled: slot === "weapon" });
  const gear = useQuery({ queryKey: ["gear-catalog"], queryFn: fetchGearCatalog, enabled: !!slot && slot !== "weapon" });
  const loading = slot === "weapon" ? weapons.isLoading : gear.isLoading;
  const label = BUILD_SLOTS.find((s) => s.key === slot)?.label ?? "";

  const items = useMemo<PickItem[]>(() => {
    if (slot === "weapon") {
      return (weapons.data ?? []).flatMap((w) => {
        const p = parseGearCode(w.item_code);
        return p ? [{ key: w.id, name: w.name, category: w.category, base: p.base, iconTier: p.tier, minTier: 4, maxTier: 8, maxEnchant: 4 }] : [];
      });
    }
    return (gear.data ?? []).filter((g) => g.slot === slot).flatMap((g) => {
      const p = parseGearCode(g.item_code);
      return p ? [{ key: g.id, name: g.name, category: g.category, base: p.base, iconTier: p.tier, minTier: g.min_tier, maxTier: g.max_tier, maxEnchant: g.max_enchant }] : [];
    });
  }, [slot, weapons.data, gear.data]);

  // Ao abrir, reposiciona no item atual (se ainda estiver no catálogo).
  useEffect(() => {
    setQ(""); setCategory(null); setChosen(null);
    const p = current ? parseGearCode(current) : null;
    if (p) { setTier(p.tier); setEnchant(p.enchant); }
    else { setTier(8); setEnchant(0); }
  }, [slot, current]);
  useEffect(() => {
    const p = current ? parseGearCode(current) : null;
    if (p && !chosen) setChosen(items.find((item) => item.base === p.base) ?? null);
  }, [items, current, chosen]);

  const categories = [...new Set(items.map((item) => item.category).filter((c): c is string => !!c))].sort();
  const nq = normalize(q.trim());
  const shown = items
    .filter((item) => (!category || item.category === category) && (!nq || normalize(`${item.name} ${item.category ?? ""}`).includes(nq)))
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "", "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));

  function pick(item: PickItem) {
    setChosen(item);
    setTier((t) => Math.min(item.maxTier, Math.max(item.minTier, t)));
    setEnchant((e) => Math.min(item.maxEnchant, e));
  }
  const tiers = chosen ? Array.from({ length: chosen.maxTier - chosen.minTier + 1 }, (_, i) => chosen.minTier + i) : [];
  const enchants = chosen ? Array.from({ length: chosen.maxEnchant + 1 }, (_, i) => i) : [];
  const code = chosen ? composeGearCode(chosen.base, tier, enchant) : null;

  return (
    <Dialog open={!!slot} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <Input autoFocus placeholder={`Buscar ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant={category === null ? "secondary" : "ghost"} onClick={() => setCategory(null)}>Todas</Button>
            {categories.map((c) => <Button key={c} type="button" size="sm" variant={category === c ? "secondary" : "ghost"} onClick={() => setCategory(c)}>{c}</Button>)}
          </div>
        )}
        <div className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {loading && <p className="col-span-full text-sm text-muted-foreground">Carregando…</p>}
          {!loading && items.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Nenhum item cadastrado nesse catálogo ainda. Um administrador pode adicionar em Administração.</p>}
          {shown.map((item) => (
            <button key={item.key} type="button" onClick={() => pick(item)} aria-pressed={chosen?.key === item.key}
              className={`flex items-center gap-2 rounded-md border bg-card p-2 text-left hover:border-primary ${chosen?.key === item.key ? "border-primary ring-2 ring-primary" : "border-border"}`}>
              <img src={itemIconUrl(composeGearCode(item.base, item.iconTier, 0), 64)} alt="" loading="lazy" className="h-12 w-12 shrink-0 object-contain" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                {item.category && <span className="block truncate text-xs text-muted-foreground">{item.category}</span>}
              </span>
            </button>
          ))}
        </div>
        {chosen && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2"><span className="w-24 text-sm text-muted-foreground">Tier</span>
              {tiers.map((t) => <Button key={t} type="button" size="sm" variant={tier === t ? "gold" : "outline"} onClick={() => setTier(t)}>T{t}</Button>)}
            </div>
            {chosen.maxEnchant > 0 && <div className="flex flex-wrap items-center gap-2"><span className="w-24 text-sm text-muted-foreground">Encantamento</span>
              {enchants.map((e) => <Button key={e} type="button" size="sm" variant={enchant === e ? "gold" : "outline"} onClick={() => setEnchant(e)}>.{e}</Button>)}
            </div>}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="text-destructive" disabled={!current} onClick={() => { onChange(null); onClose(); }}>Esvaziar slot</Button>
          <div className="flex items-center gap-2">
            {code && <span className="text-sm text-gold">{chosen?.name} {tierLabel(tier, enchant)}</span>}
            <Button type="button" variant="gold" disabled={!code} onClick={() => { if (code) { onChange(code); onClose(); } }}>Usar item</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
