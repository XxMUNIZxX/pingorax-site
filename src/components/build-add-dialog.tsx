import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useItemNames } from "@/components/build-view";
import { ItemSlot } from "@/components/item-slot";
import { fetchBuilds, normalize, type SlotKey } from "@/lib/builds";
import { useContentOptions } from "@/lib/content-options";

const GEAR_ROW: SlotKey[] = ["offhand", "helmet", "armor", "boots", "cape", "potion", "food", "mount"];

/** Janela para juntar várias builds já prontas de uma vez (usada nos grupos). */
export function BuildAddDialog({ open, onClose, taken, onAdd }: { open: boolean; onClose: () => void; taken: string[]; onAdd: (ids: string[]) => void }) {
  const builds = useQuery({ queryKey: ["builds"], queryFn: fetchBuilds, staleTime: 30_000 });
  const nameOf = useItemNames();
  const options = useContentOptions();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (open) { setQ(""); setType("all"); setPicked([]); } }, [open]);

  const all = builds.data ?? [];
  const typeList = useMemo(() => [...new Set([...options.types, ...all.flatMap((b) => b.content_type ? [b.content_type] : [])])], [options.types, all]);
  const nq = normalize(q.trim());
  const shown = all.filter((b) =>
    (type === "all" || b.content_type === type) &&
    (!nq || normalize(`${b.name} ${b.author_name ?? ""} ${b.content_type ?? ""} ${b.weapon ? nameOf(b.weapon) : ""}`).includes(nq)));
  const toggle = (id: string) => setPicked((list) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar builds prontas</DialogTitle>
          <DialogDescription>Busque e marque quantas builds quiser. Elas entram no grupo sem copiar nada: se a build mudar, o grupo acompanha.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input autoFocus className="min-w-0 flex-1 basis-40" aria-label="Buscar build" placeholder="Buscar por nome, autor, arma…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44" aria-label="Tipo de conteúdo"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os conteúdos</SelectItem>{typeList.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <ul className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1" aria-label="Builds disponíveis">
          {builds.isLoading && <li className="text-sm text-muted-foreground">Carregando builds…</li>}
          {builds.isError && <li role="alert" className="text-sm text-destructive">Não foi possível carregar as builds.</li>}
          {!builds.isLoading && !builds.isError && shown.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhuma build encontrada. Crie uma na aba <Link to="/builds" className="text-primary underline">Builds</Link>.</li>
          )}
          {shown.map((b) => {
            const already = taken.includes(b.id); const on = picked.includes(b.id);
            return (
              <li key={b.id}>
                <button type="button" disabled={already} aria-pressed={on} onClick={() => toggle(b.id)}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-lg border p-2 text-left transition enabled:hover:border-primary disabled:opacity-50 ${on ? "border-primary bg-secondary ring-1 ring-primary" : "border-border bg-card"}`}>
                  <ItemSlot code={b.weapon} label="Arma" size={52} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold">{b.name}</span>
                      {b.content_type && <Badge variant="outline" className="border-primary/50 text-primary">{b.content_type}</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{[b.weapon ? nameOf(b.weapon) : null, b.author_name ? `por ${b.author_name}` : null].filter(Boolean).join(" · ")}</span>
                    <span className="mt-1 flex gap-1" aria-hidden>{GEAR_ROW.map((key) => <ItemSlot key={key} code={b[key]} size={22} showTier={false} />)}</span>
                  </span>
                  {already && <Badge variant="secondary">No grupo</Badge>}
                  {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground" aria-live="polite">{picked.length} {picked.length === 1 ? "selecionada" : "selecionadas"}</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="button" variant="gold" disabled={!picked.length} onClick={() => { onAdd(picked); onClose(); }}>Adicionar ao grupo</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
