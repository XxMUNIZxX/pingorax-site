import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALBION_WEAPONS, fetchManagedEvents, formatDate, type GameEvent } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeaponIconInput } from "@/components/weapon-icon-input";
import { WeaponCatalogPicker } from "@/components/weapon-catalog-picker";
import { uploadWeaponIcon } from "@/lib/weapon-icons";
import { EventEditorsDialog } from "@/components/event-editors-dialog";
import { CONTENT_MODES, CONTENT_TYPES } from "@/lib/content-filters";
import { Plus, X } from "lucide-react";

type WeaponDraft = { id?: string; name: string; slots: number; icon_path?: string | null | undefined; icon_url?: string | null | undefined; iconFile?: File | undefined };
type Draft = { id?: string; title: string; description: string; starts_at: string; max_players: number; weapons: WeaponDraft[]; mode: string | null; caller_name: string | null; content_type: string | null };

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const emptyDraft = (): Draft => ({ title: "", description: "", starts_at: "", max_players: 20, weapons: [{ name: "Cajado Sagrado", slots: 2 }], mode: null, caller_name: null, content_type: null });

export function ContentPanel({ userId, isAdmin, canCreate }: { userId: string; isAdmin: boolean; canCreate: boolean }) {
  const qc = useQueryClient();
  const { data: events, isPending, isError } = useQuery({ queryKey: ["managed-events", userId, isAdmin], queryFn: fetchManagedEvents });
  const [draft, setDraft] = useState<Draft | null>(null);

  async function removeEvent(id: string) {
    if (!confirm("Apagar este conteúdo?")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) { toast.error("Não foi possível apagar o conteúdo."); return; }
    qc.invalidateQueries({ queryKey: ["managed-events"] });
  }
  async function removeSignup(id: string) {
    const { error } = await supabase.from("signups").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover o jogador."); return; }
    qc.invalidateQueries({ queryKey: ["managed-events"] });
  }
  function edit(e: GameEvent) {
    setDraft({
      id: e.id, title: e.title, description: e.description ?? "", starts_at: toLocalInput(e.starts_at), max_players: e.max_players, mode: e.mode, caller_name: e.caller_name, content_type: e.content_type,
      weapons: [...e.event_weapons].sort((a, b) => a.position - b.position).map((w) => ({ id: w.id, name: w.name, slots: w.slots, icon_path: w.icon_path, icon_url: w.icon_url })),
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-gold">Criação de conteúdo</h1>
        <div className="flex gap-2">
          {canCreate && <Button variant="gold" onClick={() => setDraft(emptyDraft())}><Plus /> Novo conteúdo</Button>}
          <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">{isAdmin ? "Todos os conteúdos" : "Meus conteúdos e compartilhados comigo"}</p>

      {draft && <EventEditor draft={draft} setDraft={setDraft} onSaved={() => { setDraft(null); qc.invalidateQueries({ queryKey: ["managed-events"] }); qc.invalidateQueries({ queryKey: ["events"] }); }} />}

      <div className="mt-8 space-y-4">
        {isPending && <p className="text-muted-foreground">Carregando conteúdos...</p>}
        {isError && <p role="alert" className="text-destructive">Não foi possível carregar os conteúdos.</p>}
        {events?.length === 0 && <p className="text-muted-foreground">Nenhum conteúdo criado ainda.</p>}
        {(events ?? []).map((e) => (
          <div key={e.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-primary">{formatDate(e.starts_at)}{e.mode && ` • ${e.mode}`}{e.content_type && ` • ${e.content_type}`}</p>
                <h2 className="text-xl font-bold">{e.title}</h2>
                {e.caller_name && <p className="text-sm text-gold">Caller: {e.caller_name}</p>}
                {!isAdmin && e.created_by !== userId && <span className="text-xs text-primary">Compartilhado comigo</span>}
                 <p className="text-sm text-muted-foreground">{e.signups.length}/{e.max_players} jogadores</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild><Link to="/evento/$id" params={{ id: e.id }}>Ver</Link></Button>
                <Button size="sm" variant="secondary" onClick={() => edit(e)}>Editar</Button>
                {(isAdmin || (canCreate && e.created_by === userId)) && <><EventEditorsDialog eventId={e.id} title={e.title} /><Button size="sm" variant="destructive" onClick={() => removeEvent(e.id)}>Apagar</Button></>}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {e.event_weapons.map((w) => {
                const list = e.signups.filter((s) => s.weapon_id === w.id);
                return (
                  <div key={w.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center gap-2 font-semibold">{w.icon_url && <img src={w.icon_url} alt="" className="h-10 w-10 shrink-0 object-contain" />}<span className="min-w-0 break-words">{w.name} <span className="text-muted-foreground">({list.length}/{w.slots})</span></span></div>
                    {list.map((s) => (
                      <div key={s.id} className="mt-1 flex items-center justify-between">
                        <span>{s.nick}</span>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeSignup(s.id)}>remover</Button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function EventEditor({ draft, setDraft, onSaved }: { draft: Draft; setDraft: (d: Draft | null) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setW = (i: number, p: Partial<WeaponDraft>) => set({ weapons: draft.weapons.map((w, j) => (j === i ? { ...w, ...p } : w)) });
  const totalSlots = draft.weapons.reduce((s, w) => s + (w.slots || 0), 0);

  async function save() {
    if (!draft.title || !draft.starts_at || draft.weapons.length === 0) { toast.error("Preencha título, horário e ao menos uma arma"); return; }
    setSaving(true);
    try {
    const payload = { title: draft.title, description: draft.description || null, starts_at: new Date(draft.starts_at).toISOString(), max_players: draft.max_players, mode: draft.mode || null, caller_name: draft.caller_name?.trim() || null, content_type: draft.content_type || null };
    let eventId = draft.id;
    if (eventId) {
      const { data, error } = await supabase.from("events").update(payload).eq("id", eventId).select("id").maybeSingle();
      if (error || !data) { toast.error(error?.message ?? "Você não tem mais permissão para editar este conteúdo."); return; }
    } else {
      const { data, error } = await supabase.from("events").insert(payload).select("id").single();
      if (error || !data) { setSaving(false); toast.error(error?.message ?? "Erro"); return; }
      eventId = data.id;
    }
    if (!eventId) throw new Error("Não foi possível salvar o conteúdo.");
    const { data: existing, error: existingError } = await supabase.from("event_weapons").select("id").eq("event_id", eventId);
    if (existingError) throw existingError;
    const keep = new Set(draft.weapons.filter((w) => w.id).map((w) => w.id));
    const toDelete = (existing ?? []).filter((w) => !keep.has(w.id)).map((w) => w.id);
    if (toDelete.length) {
      const { error } = await supabase.from("event_weapons").delete().in("id", toDelete);
      if (error) throw error;
    }
    for (const [i, w] of draft.weapons.entries()) {
      const iconPath = w.iconFile ? await uploadWeaponIcon(w.iconFile) : w.icon_path ?? null;
      const row = { event_id: eventId, name: w.name, slots: Math.max(1, w.slots), position: i, icon_path: iconPath };
      const { error } = w.id ? await supabase.from("event_weapons").update(row).eq("id", w.id) : await supabase.from("event_weapons").insert(row);
      if (error) throw error;
    }
    toast.success("Conteúdo salvo");
    onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as armas. Tente novamente.");
    } finally { setSaving(false); }
  }

  return (
    <fieldset disabled={saving} className="mt-6 min-w-0 space-y-6 border-y border-border py-6">
      <h2 className="text-xl font-bold">{draft.id ? "Editar conteúdo" : "Novo conteúdo"}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-3"><Label htmlFor="content-title">Título do conteúdo</Label><Input id="content-title" placeholder="Ex: ZvZ Black Zone, Avalon, Gank..." value={draft.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="content-start">Data e horário</Label><Input id="content-start" type="datetime-local" value={draft.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="content-capacity">Limite de jogadores</Label><Input id="content-capacity" type="number" min={1} value={draft.max_players} onChange={(e) => set({ max_players: Number(e.target.value) })} /></div>
        <div className="space-y-1">
          <Label htmlFor="content-mode">PVP ou PVE</Label>
          <Select value={draft.mode || "none"} onValueChange={(v) => set({ mode: v === "none" ? null : v })}>
            <SelectTrigger id="content-mode"><SelectValue placeholder="Selecione o modo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {CONTENT_MODES.map(mode => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="content-type">Tipo de conteúdo</Label>
          <Select value={draft.content_type || "none"} onValueChange={(v) => set({ content_type: v === "none" ? null : v })}>
            <SelectTrigger id="content-type"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {CONTENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="content-caller">Caller / líder</Label>
          <Input id="content-caller" maxLength={80} placeholder="Nome do Caller" value={draft.caller_name || ""} onChange={(e) => set({ caller_name: e.target.value })} />
        </div>
        <div className="space-y-2 md:col-span-3"><Label htmlFor="content-description">Descrição (opcional)</Label><Textarea id="content-description" placeholder="Requisitos, IP mínimo, ponto de encontro..." value={draft.description} onChange={(e) => set({ description: e.target.value })} /></div>
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Armas e vagas</h3>
          <span className={`text-sm ${totalSlots < draft.max_players ? "text-destructive" : "text-muted-foreground"}`}>{totalSlots} vagas nas armas / {draft.max_players} jogadores</span>
        </div>
        <datalist id="weapons">{ALBION_WEAPONS.map((w) => <option key={w} value={w} />)}</datalist>
        <div className="mt-2 space-y-2">
          {draft.weapons.map((w, i) => (
             <div key={i} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
              <WeaponCatalogPicker onPick={(name, file) => setW(i, { name, iconFile: file, icon_path: null, icon_url: null })} />
              <WeaponIconInput name={w.name} file={w.iconFile} url={w.icon_url} onChange={(file) => setW(i, { iconFile: file, icon_path: file ? w.icon_path : null, icon_url: file ? w.icon_url : null })} />
              <Input list="weapons" className="min-w-0 flex-1 basis-40" aria-label={`Nome da arma ${i + 1}`} placeholder="Nome da arma" value={w.name} onChange={(e) => setW(i, { name: e.target.value })} />
              <Input type="number" min={1} className="w-20 shrink-0" aria-label={`Vagas de ${w.name || "arma"}`} value={w.slots} onChange={(e) => setW(i, { slots: Number(e.target.value) })} />
               <Button variant="ghost" size="icon" aria-label={`Remover arma ${i + 1}`} title={`Remover arma ${i + 1}`} onClick={() => set({ weapons: draft.weapons.filter((_, j) => j !== i) })}><X /></Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => set({ weapons: [...draft.weapons, { name: "", slots: 1 }] })}><Plus /> Adicionar arma</Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
        <Button variant="gold" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </div>
    </fieldset>
  );
}
