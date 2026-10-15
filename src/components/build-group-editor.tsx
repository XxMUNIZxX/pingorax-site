import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuildAddDialog } from "@/components/build-add-dialog";
import { useItemNames } from "@/components/build-view";
import { ItemSlot } from "@/components/item-slot";
import { fetchBuilds } from "@/lib/builds";
import { ROLE_SUGGESTIONS, saveBuildGroup, type GroupDraft, type GroupMemberDraft } from "@/lib/build-groups";
import { useContentOptions, withCurrentValue } from "@/lib/content-options";

export function BuildGroupEditor({ id, initial, onCancel, onSaved }: { id?: string | undefined; initial: GroupDraft; onCancel: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(id);
  const options = useContentOptions();
  const nameOf = useItemNames();
  const builds = useQuery({ queryKey: ["builds"], queryFn: fetchBuilds, staleTime: 30_000 });
  const byId = useMemo(() => new Map((builds.data ?? []).map((b) => [b.id, b])), [builds.data]);
  const types = withCurrentValue(options.types, draft.content_type);
  const set = (p: Partial<GroupDraft>) => setDraft((d) => ({ ...d, ...p }));
  const players = draft.members.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);

  const patch = (i: number, p: Partial<GroupMemberDraft>) => set({ members: draft.members.map((m, k) => k === i ? { ...m, ...p } : m) });
  const remove = (i: number) => set({ members: draft.members.filter((_, k) => k !== i) });
  const move = (i: number, to: number) => {
    if (to < 0 || to >= draft.members.length) return;
    const list = [...draft.members]; const [item] = list.splice(i, 1); list.splice(to, 0, item!); set({ members: list });
  };
  const add = (ids: string[]) => set({ members: [...draft.members, ...ids.filter((b) => !draft.members.some((m) => m.build_id === b)).map((build_id) => ({ build_id, role: "", quantity: 1 }))] });

  async function save() {
    if (!draft.name.trim()) { toast.error("Dê um nome para o grupo."); return; }
    if (!draft.members.length) { toast.error("Adicione ao menos uma build ao grupo."); return; }
    setSaving(true);
    const result = await saveBuildGroup(savedId, draft);
    setSaving(false);
    if (result.id) setSavedId(result.id); // se falhar no meio, tentar de novo não cria outro grupo
    if (result.error) { toast.error(result.error.code === "23514" ? "Você chegou ao limite de grupos (ou de builds por grupo)." : "Não foi possível salvar o grupo."); return; }
    toast.success("Grupo salvo.");
    onSaved();
  }

  return (
    <fieldset disabled={saving} className="mt-6 min-w-0 border-y border-border py-6">
      <h2 className="text-xl font-bold">{id ? "Editar grupo" : "Novo grupo de builds"}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="group-name">Nome do grupo</Label><Input id="group-name" maxLength={60} placeholder="Ex.: ZvZ 20 players, Avalon Roads..." value={draft.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="space-y-1">
          <Label htmlFor="group-type">Tipo de conteúdo</Label>
          <Select value={draft.content_type || "none"} onValueChange={(v) => set({ content_type: v === "none" ? null : v })}>
            <SelectTrigger id="group-type"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Nenhum</SelectItem>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label htmlFor="group-author">Autor (opcional)</Label><Input id="group-author" maxLength={40} placeholder="Seu nick" value={draft.author_name} onChange={(e) => set({ author_name: e.target.value })} /></div>
        <div className="space-y-1 md:col-span-2"><Label htmlFor="group-desc">Descrição (opcional)</Label><Textarea id="group-desc" maxLength={500} placeholder="Estratégia, ordem de saída, observações..." value={draft.description} onChange={(e) => set({ description: e.target.value })} /></div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Builds do grupo <span className="ml-1 text-sm font-normal text-muted-foreground">({draft.members.length} {draft.members.length === 1 ? "build" : "builds"} · {players} {players === 1 ? "jogador" : "jogadores"})</span></h3>
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}><Plus /> Adicionar builds prontas</Button>
      </div>
      <datalist id="group-roles">{ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}</datalist>
      <ul className="mt-3 grid gap-2" aria-label="Builds do grupo">
        {draft.members.length === 0 && <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma build ainda. Clique em “Adicionar builds prontas”.</li>}
        {draft.members.map((m, i) => {
          const b = byId.get(m.build_id);
          return (
            <li key={m.build_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-2">
              <ItemSlot code={b?.weapon ?? null} label="Arma" size={48} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate font-semibold">{b?.name ?? "Build"}</p>
                <p className="truncate text-xs text-muted-foreground">{b?.weapon ? nameOf(b.weapon) : ""}</p>
              </div>
              <Input list="group-roles" aria-label={`Papel de ${b?.name ?? "build"}`} className="w-32" maxLength={40} placeholder="Papel (opcional)" value={m.role} onChange={(e) => patch(i, { role: e.target.value })} />
              <Input type="number" inputMode="numeric" min={1} max={50} aria-label={`Quantidade de ${b?.name ?? "build"}`} className="w-20" value={m.quantity}
                onChange={(e) => patch(i, { quantity: e.target.value === "" ? 1 : Math.min(50, Math.max(1, Number(e.target.value))) })} />
              <div className="flex">
                <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Descer" disabled={i === draft.members.length - 1} onClick={() => move(i, i + 1)}><ArrowDown /></Button>
                <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Tirar ${b?.name ?? "build"} do grupo`} onClick={() => remove(i)}><Trash2 /></Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button variant="gold" onClick={save}>{saving ? "Salvando..." : "Salvar grupo"}</Button>
      </div>
      <BuildAddDialog open={adding} onClose={() => setAdding(false)} taken={draft.members.map((m) => m.build_id)} onAdd={add} />
    </fieldset>
  );
}
