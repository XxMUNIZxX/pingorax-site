import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BUILD_SLOTS, fetchGearCatalog, itemIconUrl, normalize, parseGearCode, type GearItem, type GearSlot } from "@/lib/builds";
import { parseItemCode } from "@/lib/weapon-catalog";

const GEAR_SLOTS = BUILD_SLOTS.filter((slot) => slot.key !== "weapon");

export function GearCatalogPanel() {
  const { data = [], isError } = useQuery({ queryKey: ["gear-catalog"], queryFn: fetchGearCatalog });
  return (
    <section className="mt-6 border-y border-border py-6">
      <h2 className="text-xl font-bold text-gold">Catálogo de equipamentos (builds)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Itens que aparecem ao montar uma build. As armas continuam no catálogo de armas abaixo. Cadastre o item pelo
        código do tier mais alto (ex.: T8_HEAD_PLATE_SET1) ou colando o link da imagem do Albion; quem monta a build
        escolhe o tier e o encantamento dentro da faixa que você definir.
      </p>
      {isError && <p role="alert" className="mt-3 text-sm text-destructive">Não foi possível carregar o catálogo. Confira se a migração 0003 foi executada.</p>}
      <Tabs defaultValue="helmet" className="mt-4">
        <TabsList className="h-auto flex-wrap justify-start">
          {GEAR_SLOTS.map((slot) => (
            <TabsTrigger key={slot.key} value={slot.key}>{slot.label} ({data.filter((item) => item.slot === slot.key).length})</TabsTrigger>
          ))}
        </TabsList>
        {GEAR_SLOTS.map((slot) => (
          <TabsContent key={slot.key} value={slot.key}>
            <SlotCatalog slot={slot.key as GearSlot} label={slot.label} items={data.filter((item) => item.slot === slot.key)} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function SlotCatalog({ slot, label, items }: { slot: GearSlot; label: string; items: GearItem[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [code, setCode] = useState("");
  const [minTier, setMinTier] = useState(4);
  const [maxTier, setMaxTier] = useState(8);
  const [maxEnchant, setMaxEnchant] = useState(4);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const raw = parseItemCode(code);
  const parsed = raw ? parseGearCode(raw) : null;
  const baseCode = parsed ? `T${parsed.tier}_${parsed.base}` : null;

  async function add() {
    if (!name.trim() || !baseCode) { toast.error("Informe o nome e o código/link do item com o tier, ex.: T8_HEAD_PLATE_SET1."); return; }
    if (minTier > maxTier) { toast.error("O tier mínimo não pode ser maior que o máximo."); return; }
    setBusy(true);
    const { error } = await supabase.from("gear_catalog").insert({
      slot, name: name.trim(), category: category.trim() || null, item_code: baseCode,
      min_tier: minTier, max_tier: maxTier, max_enchant: maxEnchant,
      position: items.reduce((max, item) => Math.max(max, item.position), 0) + 10,
    });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "Esse item já está nesse catálogo." : "Não foi possível adicionar."); return; }
    toast.success(`${label} adicionado(a) ao catálogo`);
    setName(""); setCode("");
    void qc.invalidateQueries({ queryKey: ["gear-catalog"] });
  }
  async function remove(item: GearItem) {
    if (!confirm(`Remover "${item.name}" do catálogo? Builds que já usam esse item continuam funcionando.`)) return;
    const { error } = await supabase.from("gear_catalog").delete().eq("id", item.id);
    if (error) { toast.error("Não foi possível remover."); return; }
    void qc.invalidateQueries({ queryKey: ["gear-catalog"] });
  }

  const q2 = normalize(q.trim());
  const shown = q2 ? items.filter((item) => normalize(`${item.name} ${item.category ?? ""} ${item.item_code}`).includes(q2)) : items;
  const num = (set: (n: number) => void, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => set(Math.min(max, Math.max(min, Number(e.target.value) || min)));

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded border border-border">{baseCode && <img src={itemIconUrl(baseCode, 64)} alt="" className="h-10 w-10 object-contain" />}</div>
        <Input className="min-w-0 flex-1 basis-40" aria-label="Nome do item" placeholder="Nome do item" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="w-36" aria-label="Categoria" placeholder="Categoria" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} />
        <Input className="min-w-0 flex-1 basis-56" aria-label="Link ou código do item" placeholder="Link ou código (T8_...)" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">Tier de <Input type="number" className="w-16" min={1} max={8} value={minTier} onChange={num(setMinTier, 1, 8)} /></label>
        <label className="flex items-center gap-1">até <Input type="number" className="w-16" min={1} max={8} value={maxTier} onChange={num(setMaxTier, 1, 8)} /></label>
        <label className="flex items-center gap-1">Encantamento até .<Input type="number" className="w-16" min={0} max={4} value={maxEnchant} onChange={num(setMaxEnchant, 0, 4)} /></label>
        <Button variant="gold" disabled={busy} onClick={add}>Adicionar</Button>
      </div>
      <Input className="mt-4" placeholder={`Buscar em ${label} (${items.length} itens)…`} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
        {items.length === 0 && <li className="text-sm text-muted-foreground">Nenhum item cadastrado.</li>}
        {shown.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded border border-border p-2">
            <img src={itemIconUrl(item.item_code, 64)} alt="" loading="lazy" className="h-10 w-10 shrink-0 object-contain" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{item.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.category ?? "—"} · T{item.min_tier}-T{item.max_tier} · .{item.max_enchant} · {item.item_code}</span>
            </span>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(item)}>Remover</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
