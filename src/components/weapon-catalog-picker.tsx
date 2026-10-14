import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { catalogIconUrl, fetchWeaponCatalog, searchCatalog, type CatalogWeapon } from "@/lib/weapon-catalog";

/** Escolhe uma arma do catálogo. A imagem vem direto do código do item, sem baixar nem enviar arquivo. */
export function WeaponCatalogPicker({ onPick }: { onPick: (weapon: CatalogWeapon) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({ queryKey: ["weapon-catalog"], queryFn: fetchWeaponCatalog, enabled: open, staleTime: 60_000 });
  const shown = searchCatalog(data, q);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-12 w-12" title="Escolher do catálogo" aria-label="Escolher arma do catálogo"><BookOpen /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Catálogo de armas</DialogTitle></DialogHeader>
        <Input autoFocus placeholder="Buscar arma ou categoria…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {isLoading && <p className="col-span-full text-sm text-muted-foreground">Carregando…</p>}
          {shown.map((w) => (
            <button key={w.id} type="button" onClick={() => { onPick(w); setOpen(false); }} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-left hover:border-primary">
              <img src={catalogIconUrl(w.item_code)} alt="" loading="lazy" className="h-12 w-12 shrink-0 object-contain" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                {w.category && <span className="block truncate text-xs text-muted-foreground">{w.category}</span>}
              </span>
            </button>
          ))}
          {!isLoading && shown.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Nenhuma arma encontrada.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
