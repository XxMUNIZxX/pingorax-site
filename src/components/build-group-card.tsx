import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useItemNames } from "@/components/build-view";
import { ItemSlot } from "@/components/item-slot";
import { BUILD_SLOTS, type Build } from "@/lib/builds";
import { groupSize, type BuildGroup } from "@/lib/build-groups";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function BuildGroupCard({ group, builds, mine, onOpen }: { group: BuildGroup; builds: Map<string, Build>; mine: boolean; onOpen: () => void }) {
  const size = groupSize(group);
  return (
    <button type="button" onClick={onOpen} aria-label={`Abrir grupo ${group.name}`}
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-glow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <span aria-hidden className="h-1 w-full bg-gradient-to-r from-[oklch(0.77_0.15_300)] to-[oklch(0.8_0.12_245)] opacity-70 transition group-hover:opacity-100" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5">
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          {group.content_type
            ? <Badge variant="outline" className="border-primary/50 bg-primary/10 text-primary">{group.content_type}</Badge>
            : <span className="text-xs text-muted-foreground">Sem tipo de conteúdo</span>}
          {mine && <Badge variant="secondary">Seu grupo</Badge>}
          <span className="ml-auto flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-xs font-semibold text-gold" title={plural(size, "jogador", "jogadores")}><Users className="h-3.5 w-3.5" />{size}</span>
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 break-words text-base font-bold leading-tight">{group.name}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{[group.author_name ? `por ${group.author_name}` : "autor não informado", plural(group.members.length, "build", "builds")].join(" · ")}</p>
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5 rounded-lg bg-background/40 p-1.5" aria-hidden>
          {group.members.slice(0, 8).map((m) => <ItemSlot key={m.id} code={builds.get(m.build_id)?.weapon ?? null} size={40} showTier={false} />)}
          {group.members.length > 8 && <span className="flex h-10 items-center px-1 text-xs text-muted-foreground">+{group.members.length - 8}</span>}
        </div>
      </div>
    </button>
  );
}

export function BuildGroupDialog({ group, builds, canChange, onClose, onEdit, onDelete }: {
  group: BuildGroup | null; builds: Map<string, Build>; canChange: boolean; onClose: () => void; onEdit: (group: BuildGroup) => void; onDelete: (group: BuildGroup) => void;
}) {
  const nameOf = useItemNames();
  return (
    <Dialog open={!!group} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {group && <>
          <DialogHeader>
            <DialogTitle className="break-words">{group.name}</DialogTitle>
            <DialogDescription>
              {[group.content_type, group.author_name ? `por ${group.author_name}` : null, `${plural(group.members.length, "build", "builds")} · ${plural(groupSize(group), "jogador", "jogadores")}`].filter(Boolean).join(" · ")}
            </DialogDescription>
          </DialogHeader>
          {group.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{group.description}</p>}
          <ul className="grid gap-2" aria-label="Builds do grupo">
            {group.members.map((m) => {
              const b = builds.get(m.build_id);
              if (!b) return null;
              return (
                <li key={m.id} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{b.name}</span>
                    {m.role && <Badge variant="outline" className="border-primary/50 text-primary">{m.role}</Badge>}
                    <span className="ml-auto rounded-full bg-background/60 px-2 py-0.5 text-xs font-semibold text-gold">×{m.quantity}</span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">{b.weapon ? nameOf(b.weapon) : "Sem arma"}{b.author_name ? ` · por ${b.author_name}` : ""}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BUILD_SLOTS.map((slot) => <span key={slot.key} title={b[slot.key] ? `${slot.label}: ${nameOf(b[slot.key]!)}` : slot.label}><ItemSlot code={b[slot.key]} size={44} /></span>)}
                  </div>
                </li>
              );
            })}
          </ul>
          {canChange && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" className="text-destructive" onClick={() => onDelete(group)}>Apagar</Button>
              <Button variant="secondary" onClick={() => onEdit(group)}>Editar</Button>
            </div>
          )}
        </>}
      </DialogContent>
    </Dialog>
  );
}
