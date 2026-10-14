import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuildGear } from "@/components/build-view";
import { BuildSlotPicker } from "@/components/build-slot-picker";
import { buildPayload, type BuildDraft, type SlotKey } from "@/lib/builds";
import { useContentOptions, withCurrentValue } from "@/lib/content-options";

export function BuildEditor({ id, initial, onCancel, onSaved }: { id?: string | undefined; initial: BuildDraft; onCancel: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [slot, setSlot] = useState<SlotKey | null>(null);
  const [saving, setSaving] = useState(false);
  const options = useContentOptions();
  const types = withCurrentValue(options.types, draft.content_type);
  const set = (p: Partial<BuildDraft>) => setDraft((d) => ({ ...d, ...p }));

  async function save() {
    if (!draft.name.trim()) { toast.error("Dê um nome para a build."); return; }
    if (!draft.weapon) { toast.error("Escolha ao menos a arma da build."); return; }
    setSaving(true);
    const payload = buildPayload(draft);
    const { error } = id
      ? await supabase.from("builds").update(payload).eq("id", id)
      : await supabase.from("builds").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.code === "23514" ? "Você chegou ao limite de builds da conta." : "Não foi possível salvar a build."); return; }
    toast.success("Build salva.");
    onSaved();
  }

  return (
    <fieldset disabled={saving} className="mt-6 min-w-0 border-y border-border py-6">
      <h2 className="text-xl font-bold">{id ? "Editar build" : "Nova build"}</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-4">
          <div className="space-y-1"><Label htmlFor="build-name">Nome da build</Label><Input id="build-name" maxLength={60} placeholder="Ex.: Sagrado ZvZ, Frost de Avalon..." value={draft.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1">
            <Label htmlFor="build-type">Tipo de conteúdo</Label>
            <Select value={draft.content_type || "none"} onValueChange={(v) => set({ content_type: v === "none" ? null : v })}>
              <SelectTrigger id="build-type"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {types.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="build-author">Autor (opcional)</Label><Input id="build-author" maxLength={40} placeholder="Seu nick" value={draft.author_name} onChange={(e) => set({ author_name: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="build-desc">Descrição (opcional)</Label><Textarea id="build-desc" maxLength={500} placeholder="Rotação, dicas, quando usar..." value={draft.description} onChange={(e) => set({ description: e.target.value })} /></div>
        </div>
        <div>
          <BuildGear build={draft} size={72} onPick={setSlot} />
          <p className="mt-2 text-center text-xs text-muted-foreground">Clique em um espaço para escolher o item.</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button variant="gold" onClick={save}>{saving ? "Salvando..." : "Salvar build"}</Button>
      </div>
      <BuildSlotPicker slot={slot} current={slot ? draft[slot] : null} onClose={() => setSlot(null)} onChange={(code) => { if (slot) set({ [slot]: code } as Partial<BuildDraft>); }} />
    </fieldset>
  );
}
