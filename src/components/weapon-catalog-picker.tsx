import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { catalogIconUrl, fetchWeaponCatalog, searchCatalog, type CatalogWeapon } from "@/lib/weapon-catalog";
import { fetchWeaponIcon } from "@/lib/weapon-icons";
import { getAlbionWeaponIcon } from "@/lib/weapon-icons.functions";

export function WeaponCatalogPicker({ onPick }: { onPick: (name: string, icon: File | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string>();
  const loadAlbion = useServerFn(getAlbionWeaponIcon);
  const { data = [], isLoading } = useQuery({ queryKey: ["weapon-catalog"], queryFn: fetchWeaponCatalog, enabled: open });

  async function pick(w: CatalogWeapon) {
    setBusy(w.id);
    try {
      const file = await fetchWeaponIcon(catalogIconUrl(w.item_code), (url) => loadAlbion({ data: url }));
      onPick(w.name, file);
      setOpen(false);
    } catch {
      toast.error("Não foi possível carregar o ícone; a arma foi adicionada sem foto.");
      onPick(w.name, undefined);
      setOpen(false);
    } finally { setBusy(undefined); }
  }

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
          {searchCatalog(data, q).map((w) => (
            <button key={w.id} type="button" disabled={!!busy} onClick={() => pick(w)} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-left hover:border-primary disabled:opacity-60">
              <img src={catalogIconUrl(w.item_code)} alt="" loading="lazy" className="h-12 w-12 shrink-0 object-contain" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                {w.category && <span className="block truncate text-xs text-muted-foreground">{w.category}</span>}
              </span>
              {busy === w.id && <LoaderCircle className="h-4 w-4 animate-spin" />}
            </button>
          ))}
          {!isLoading && searchCatalog(data, q).length === 0 && <p className="col-span-full text-sm text-muted-foreground">Nenhuma arma encontrada.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
