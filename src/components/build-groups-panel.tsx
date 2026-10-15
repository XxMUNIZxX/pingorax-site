import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuildGroupCard, BuildGroupDialog } from "@/components/build-group-card";
import { BuildGroupEditor } from "@/components/build-group-editor";
import { fetchBuilds, normalize } from "@/lib/builds";
import { draftFromGroup, emptyGroupDraft, fetchBuildGroups, type BuildGroup, type GroupDraft } from "@/lib/build-groups";
import { useContentOptions } from "@/lib/content-options";

type Editing = { id?: string; draft: GroupDraft } | null;

/** Aba "Grupos": composições que reúnem builds já prontas. */
export function BuildGroupsPanel({ userId, isAdmin, onNeedLogin }: { userId: string | undefined; isAdmin: boolean; onNeedLogin: () => void }) {
  const qc = useQueryClient();
  const options = useContentOptions();
  const groups = useQuery({ queryKey: ["build-groups"], queryFn: fetchBuildGroups });
  const builds = useQuery({ queryKey: ["builds"], queryFn: fetchBuilds, staleTime: 30_000 });
  const byId = useMemo(() => new Map((builds.data ?? []).map((b) => [b.id, b])), [builds.data]);

  const [editing, setEditing] = useState<Editing>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);

  const all = groups.data ?? [];
  const typeList = useMemo(() => [...new Set([...options.types, ...all.flatMap((g) => g.content_type ? [g.content_type] : [])])], [options.types, all]);
  const nq = normalize(q.trim());
  const shown = all.filter((g) =>
    (!onlyMine || g.owner_id === userId) && (type === "all" || g.content_type === type) &&
    (!nq || normalize(`${g.name} ${g.author_name ?? ""} ${g.description ?? ""}`).includes(nq)));
  const filtered = type !== "all" || !!q || onlyMine;
  const openedGroup = opened ? all.find((g) => g.id === opened) ?? null : null;
  const canChange = (g: BuildGroup) => !!userId && (g.owner_id === userId || isAdmin);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["build-groups"] });

  function startNew() {
    if (!userId) { onNeedLogin(); return; }
    setEditing({ draft: { ...emptyGroupDraft(), content_type: type !== "all" ? type : null } });
  }
  function startEdit(g: BuildGroup) { setOpened(null); setEditing({ id: g.id, draft: draftFromGroup(g) }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function remove(g: BuildGroup) {
    if (!confirm(`Apagar o grupo "${g.name}"? As builds dentro dele não são apagadas.`)) return;
    const { error } = await supabase.from("build_groups").delete().eq("id", g.id);
    if (error) { toast.error("Não foi possível apagar o grupo."); return; }
    toast.success("Grupo apagado.");
    setOpened(null);
    refresh();
  }

  return (
    <section aria-label="Grupos de builds">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">Monte uma composição juntando builds que já existem, com o papel e a quantidade de cada uma. Ótimo para ZvZ, Avalon e conteúdos em grupo.</p>
        <Button variant="gold" onClick={startNew}><Plus /> Novo grupo</Button>
      </div>

      {editing && <BuildGroupEditor key={editing.id ?? "new"} id={editing.id} initial={editing.draft} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}

      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Input aria-label="Buscar grupos" placeholder="Buscar por nome, autor ou descrição…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Tipo de conteúdo"><SelectValue placeholder="Tipo de conteúdo" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os conteúdos</SelectItem>{typeList.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {userId && <Button size="sm" variant={onlyMine ? "secondary" : "outline"} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>Meus grupos</Button>}
        <Button size="sm" variant="ghost" disabled={!filtered} onClick={() => { setQ(""); setType("all"); setOnlyMine(false); }}><RotateCcw /> Limpar filtros</Button>
        <span className="ml-auto text-muted-foreground" aria-live="polite">{shown.length} {shown.length === 1 ? "grupo" : "grupos"}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.isPending && <p className="text-muted-foreground">Carregando grupos...</p>}
        {groups.isError && <p role="alert" className="text-destructive sm:col-span-2 lg:col-span-3">Não foi possível carregar os grupos. Confira se a migração 0008 foi executada no Supabase.</p>}
        {!groups.isPending && !groups.isError && shown.length === 0 && <p className="text-muted-foreground sm:col-span-2 lg:col-span-3">Nenhum grupo encontrado{filtered ? " com esses filtros" : ""}.</p>}
        {shown.map((g) => <BuildGroupCard key={g.id} group={g} builds={byId} mine={g.owner_id === userId} onOpen={() => setOpened(g.id)} />)}
      </div>

      <BuildGroupDialog group={openedGroup} builds={byId} canChange={openedGroup ? canChange(openedGroup) : false} onClose={() => setOpened(null)} onEdit={startEdit} onDelete={remove} />
    </section>
  );
}
