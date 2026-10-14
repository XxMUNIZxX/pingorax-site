import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AuthForm, usePanelAccess } from "@/components/panel-access";
import { BuildGear } from "@/components/build-view";
import { BuildSlotPicker } from "@/components/build-slot-picker";
import {
  buildPayload, draftFromBuild, emptyBuildDraft, fetchBuilds, normalize,
  type Build, type BuildDraft, type SlotKey,
} from "@/lib/builds";

export const Route = createFileRoute("/builds")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Builds — PingoraX" },
    { name: "description", content: "Monte e compartilhe builds de Albion Online: arma, elmo, armadura, bota, capa, poção, comida, mão secundária e montaria." },
    { property: "og:title", content: "Builds — PingoraX" },
    { property: "og:description", content: "Monte e compartilhe builds de Albion Online." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BuildsPage,
});

type Editing = { id?: string; draft: BuildDraft } | null;

function BuildsPage() {
  const qc = useQueryClient();
  const access = usePanelAccess();
  const userId = access.session?.user.id;
  const { data: builds, isPending, isError } = useQuery({ queryKey: ["builds"], queryFn: fetchBuilds });
  const [editing, setEditing] = useState<Editing>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const nq = normalize(q.trim());
  const shown = (builds ?? []).filter((b) => (!onlyMine || b.owner_id === userId) && (!nq || normalize(`${b.name} ${b.author_name ?? ""} ${b.description ?? ""}`).includes(nq)));
  const canChange = (b: Build) => !!userId && (b.owner_id === userId || access.isAdmin);

  function startNew() {
    if (!access.session) { setNeedLogin(true); return; }
    setEditing({ draft: emptyBuildDraft() });
  }
  async function remove(b: Build) {
    if (!confirm(`Apagar a build "${b.name}"? Conteúdos que usam ela ficam sem build.`)) return;
    const { error } = await supabase.from("builds").delete().eq("id", b.id);
    if (error) { toast.error("Não foi possível apagar a build."); return; }
    toast.success("Build apagada.");
    void qc.invalidateQueries({ queryKey: ["builds"] });
    void qc.invalidateQueries({ queryKey: ["events"] });
    void qc.invalidateQueries({ queryKey: ["event"] });
    void qc.invalidateQueries({ queryKey: ["managed-events"] });
  }

  if (needLogin && !access.session && !access.loading) {
    return <div><AuthForm redirectPath="/builds" title="Entre para criar builds" />
      <p className="text-center"><Button variant="ghost" onClick={() => setNeedLogin(false)}>Voltar às builds</Button></p></div>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gold">Builds</h1>
          <p className="mt-1 text-sm text-muted-foreground">Qualquer pessoa com conta pode criar builds. Criadores ligam elas às armas dos conteúdos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="gold" onClick={startNew}><Plus /> Nova build</Button>
          {access.session && <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>}
        </div>
      </div>

      {editing && <BuildEditor key={editing.id ?? "new"} editing={editing} onCancel={() => setEditing(null)} onSaved={() => {
        setEditing(null);
        void qc.invalidateQueries({ queryKey: ["builds"] });
        void qc.invalidateQueries({ queryKey: ["event"] });
        void qc.invalidateQueries({ queryKey: ["events"] });
        void qc.invalidateQueries({ queryKey: ["managed-events"] });
      }} />}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Input className="min-w-0 flex-1 basis-56" aria-label="Buscar builds" placeholder="Buscar por nome, autor ou descrição…" value={q} onChange={(e) => setQ(e.target.value)} />
        {userId && <Button variant={onlyMine ? "secondary" : "outline"} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>Minhas builds</Button>}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {isPending && <p className="text-muted-foreground">Carregando builds...</p>}
        {isError && <p role="alert" className="text-destructive">Não foi possível carregar as builds. Confira se a migração 0003 foi executada no Supabase.</p>}
        {!isPending && !isError && shown.length === 0 && <p className="text-muted-foreground">Nenhuma build encontrada.</p>}
        {shown.map((b) => (
          <article key={b.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold">{b.name}</h2>
                <p className="text-xs text-muted-foreground">{b.author_name ? `por ${b.author_name}` : "autor não informado"}{b.owner_id === userId && " · sua build"}</p>
              </div>
              {canChange(b) && <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => { setEditing({ id: b.id, draft: draftFromBuild(b) }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(b)}>Apagar</Button>
              </div>}
            </div>
            {b.description && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{b.description}</p>}
            <div className="mx-auto mt-3 max-w-sm"><BuildGear build={b} size={56} /></div>
          </article>
        ))}
      </div>
    </main>
  );
}

function BuildEditor({ editing, onCancel, onSaved }: { editing: NonNullable<Editing>; onCancel: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(editing.draft);
  const [slot, setSlot] = useState<SlotKey | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<BuildDraft>) => setDraft((d) => ({ ...d, ...p }));

  async function save() {
    if (!draft.name.trim()) { toast.error("Dê um nome para a build."); return; }
    if (!draft.weapon) { toast.error("Escolha ao menos a arma da build."); return; }
    setSaving(true);
    const payload = buildPayload(draft);
    const { error } = editing.id
      ? await supabase.from("builds").update(payload).eq("id", editing.id)
      : await supabase.from("builds").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.code === "23514" ? "Você chegou ao limite de builds da conta." : "Não foi possível salvar a build."); return; }
    toast.success("Build salva.");
    onSaved();
  }

  return (
    <fieldset disabled={saving} className="mt-6 min-w-0 border-y border-border py-6">
      <h2 className="text-xl font-bold">{editing.id ? "Editar build" : "Nova build"}</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-4">
          <div className="space-y-1"><Label htmlFor="build-name">Nome da build</Label><Input id="build-name" maxLength={60} placeholder="Ex.: Sagrado ZvZ, Frost de Avalon..." value={draft.name} onChange={(e) => set({ name: e.target.value })} /></div>
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
