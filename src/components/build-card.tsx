import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BuildGear, SlotCell, useItemNames } from "@/components/build-view";
import { BUILD_SLOTS, type Build, type SlotKey } from "@/lib/builds";

const SMALL_ORDER: SlotKey[] = ["offhand", "helmet", "armor", "boots", "cape", "potion", "food", "mount"];

export function BuildCard({ build, uses, showGear, mine, onOpen }: { build: Build; uses: number; showGear: boolean; mine: boolean; onOpen: () => void }) {
  const nameOf = useItemNames();
  return (
    <button type="button" onClick={onOpen} aria-label={`Abrir build ${build.name}`}
      className="panel flex h-full min-w-0 flex-col gap-3 p-3 text-left transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <div className="flex flex-wrap items-center gap-1.5">
        {build.content_type && <Badge variant="outline" className="border-primary/50 text-primary">{build.content_type}</Badge>}
        {mine && <Badge variant="secondary">Sua build</Badge>}
        {uses > 0 && <span className="ml-auto flex items-center gap-1 text-xs text-gold" title={`Usada em ${uses} ${uses === 1 ? "conteúdo" : "conteúdos"}`}><Flame className="h-3.5 w-3.5" />{uses}</span>}
      </div>
      <div className="flex items-start gap-3">
        <div className="w-16 shrink-0"><SlotCell slotKey="weapon" code={build.weapon} {...(build.weapon ? { name: nameOf(build.weapon) } : {})} size={52} /></div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 break-words font-bold leading-tight">{build.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{build.author_name ? `por ${build.author_name}` : "autor não informado"}</p>
        </div>
      </div>
      {showGear && (
        <div className="grid grid-cols-8 gap-1" aria-hidden>
          {SMALL_ORDER.map((key) => (
            <div key={key} className="aspect-square overflow-hidden rounded border border-border bg-background/40">
              {build[key] && <img src={`https://render.albiononline.com/v1/item/${encodeURIComponent(build[key]!)}.png?quality=1&size=64`} alt="" loading="lazy" className="h-full w-full object-contain" />}
            </div>
          ))}
        </div>
      )}
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
