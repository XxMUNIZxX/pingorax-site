import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BuildGear, useItemNames } from "@/components/build-view";
import { ItemSlot } from "@/components/item-slot";
import { BUILD_SLOTS, type Build, type SlotKey } from "@/lib/builds";

const SMALL_ORDER: SlotKey[] = ["offhand", "helmet", "armor", "boots", "cape", "potion", "food", "mount"];

export function BuildCard({ build, uses, showGear, mine, onOpen }: { build: Build; uses: number; showGear: boolean; mine: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`Abrir build ${build.name}`}
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-glow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <span aria-hidden className="h-1 w-full bg-gradient-to-r from-[oklch(0.8_0.12_245)] to-[oklch(0.77_0.15_300)] opacity-70 transition group-hover:opacity-100" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5">
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          {build.content_type
            ? <Badge variant="outline" className="border-primary/50 bg-primary/10 text-primary">{build.content_type}</Badge>
            : <span className="text-xs text-muted-foreground">Sem tipo de conteúdo</span>}
          {mine && <Badge variant="secondary">Sua build</Badge>}
          {uses > 0 && <span className="ml-auto flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-xs font-semibold text-gold" title={`Usada em ${uses} ${uses === 1 ? "conteúdo" : "conteúdos"}`}><Flame className="h-3.5 w-3.5" />{uses}</span>}
        </div>
        <div className="flex items-center gap-3">
          <ItemSlot code={build.weapon} label="Arma" size={72} />
          <div className="min-w-0">
            <h3 className="line-clamp-2 break-words text-base font-bold leading-tight">{build.name}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{build.author_name ? `por ${build.author_name}` : "autor não informado"}</p>
          </div>
        </div>
        {showGear && (
          <div className="mt-auto grid grid-cols-8 gap-1 rounded-lg bg-background/40 p-1.5" aria-hidden>
            {SMALL_ORDER.map((key) => <ItemSlot key={key} code={build[key]} size={40} showTier={false} fluid />)}
          </div>
        )}
      </div>
    </button>
  );
}

export function BuildDialog({ build, uses, canChange, onClose, onEdit, onDelete }: {
  build: Build | null; uses: number; canChange: boolean; onClose: () => void; onEdit: (build: Build) => void; onDelete: (build: Build) => void;
}) {
  const nameOf = useItemNames();
  return (
    <Dialog open={!!build} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        {build && <>
          <DialogHeader>
            <DialogTitle className="break-words">{build.name}</DialogTitle>
            <DialogDescription>
              {[build.content_type, build.author_name ? `por ${build.author_name}` : null, uses > 0 ? `usada em ${uses} ${uses === 1 ? "conteúdo" : "conteúdos"}` : null].filter(Boolean).join(" · ") || "Build"}
            </DialogDescription>
          </DialogHeader>
          {build.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{build.description}</p>}
          <div className="mx-auto w-full max-w-sm"><BuildGear build={build} size={72} /></div>
          <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {BUILD_SLOTS.filter((slot) => build[slot.key]).map((slot) => (
              <li key={slot.key} className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">{slot.label}</span><span className="min-w-0 break-words">{nameOf(build[slot.key]!)}</span></li>
            ))}
          </ul>
          {canChange && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" className="text-destructive" onClick={() => onDelete(build)}>Apagar</Button>
              <Button variant="secondary" onClick={() => onEdit(build)}>Editar</Button>
            </div>
          )}
        </>}
      </DialogContent>
    </Dialog>
  );
}
