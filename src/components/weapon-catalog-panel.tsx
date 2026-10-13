import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { catalogIconUrl, fetchWeaponCatalog, parseItemCode, searchCatalog } from "@/lib/weapon-catalog";

export function WeaponCatalogPanel() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["weapon-catalog"], queryFn: fetchWeaponCatalog });
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const parsed = parseItemCode(code);

  async function add() {
    if (!name.trim() || !parsed) { toast.error("Informe o nome e o código ou link do item do Albion."); return; }
    const { error } = await supabase.from("weapon_catalog").insert({ name: name.trim(), category: category.trim() || null, item_code: parsed, position: (data.at(-1)?.position ?? 0) + 1 });
    if (error) { toast.error(error.code === "23505" ? "Esse item já está no catálogo." : "Não foi possível adicionar."); return; }
    toast.success("Arma adicionada ao catálogo");
    setName(""); setCategory(""); setCode("");
    qc.invalidateQueries({ queryKey: ["weapon-catalog"] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("weapon_catalog").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover."); return; }
    qc.invalidateQueries({ queryKey: ["weapon-catalog"] });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-display text-xl text-primary">Catálogo de armas</h2>
      <p className="mt-1 text-sm text-muted-foreground">Armas com foto que os criadores escolhem rapidamente ao montar a composição. Cole o link da imagem do Albion (render.albiononline.com) ou só o código, ex.: T8_MAIN_MACE.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded border border-border">{parsed && <img src={catalogIconUrl(parsed)} alt="" className="h-10 w-10 object-contain" />}</div>
        <Input className="min-w-0 flex-1 basis-40" placeholder="Nome da arma" value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="w-36" placeholder="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} />
        <Input className="min-w-0 flex-1 basis-56" placeholder="Link ou código do item" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button variant="gold" onClick={add}>Adicionar</Button>
      </div>
      <Input className="mt-4" placeholder={`Buscar no catálogo (${data.length} armas)…`} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
        {searchCatalog(data, q).map((w) => (
          <li key={w.id} className="flex items-center gap-2 rounded border border-border p-2">
            <img src={catalogIconUrl(w.item_code)} alt="" loading="lazy" className="h-10 w-10 object-contain" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm">{w.name}</span><span className="block truncate text-xs text-muted-foreground">{w.category ?? "—"} · {w.item_code}</span></span>
            <Button variant="ghost" size="sm" onClick={() => remove(w.id)}>Remover</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
