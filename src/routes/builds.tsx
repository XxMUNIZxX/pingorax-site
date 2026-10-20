import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AuthForm, usePanelAccess } from "@/components/panel-access";
import { BuildCard, BuildDialog } from "@/components/build-card";
import { BuildEditor } from "@/components/build-editor";
import { BuildGroupsPanel } from "@/components/build-groups-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BuildWeaponFilter, NO_CATEGORY, groupWeapons } from "@/components/build-weapon-filter";
import { baseOf, draftFromBuild, emptyBuildDraft, fetchBuilds, fetchBuildUsage, normalize, type Build, type BuildDraft } from "@/lib/builds";
import { useContentOptions } from "@/lib/content-options";
import { fetchWeaponCatalog } from "@/lib/weapon-catalog";

export const Route = createFileRoute("/builds")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Builds — PingoraX" },
    { name: "description", content: "Encontre builds de Albion Online por arma e tipo de conteúdo, ou monte e compartilhe a sua." },
    { property: "og:title", content: "Builds — PingoraX" },
    { property: "og:description", content: "Encontre builds de Albion Online por arma e tipo de conteúdo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BuildsPage,
});

type Editing = { id?: string; copyOf?: string; key: string; draft: BuildDraft } | null;
type Sort = "popular" | "recent" | "name";
type Tab = "builds" | "grupos";

function BuildsPage() {
  const qc = useQueryClient();
  const access = usePanelAccess();
  const userId = access.session?.user.id;
  const options = useContentOptions();
  const { data: builds, isPending, isError } = useQuery({ queryKey: ["builds"], queryFn: fetchBuilds });
  const usageQuery = useQuery({ queryKey: ["build-usage"], queryFn: fetchBuildUsage, staleTime: 30_000 });
  const catalog = useQuery({ queryKey: ["weapon-catalog"], queryFn: fetchWeaponCatalog, staleTime: 60_000 });
  const usage = usageQuery.data;

  const [editing, setEditing] = useState<Editing>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [weapon, setWeapon] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [author, setAuthor] = useState("all");
  const [sort, setSort] = useState<Sort>("popular");
  const [onlyMine, setOnlyMine] = useState(false);
  const [showGear, setShowGear] = useState(true);
  const [tab, setTab] = useState<Tab>("builds");

  const groups = useMemo(() => groupWeapons(catalog.data ?? []), [catalog.data]);
  const categoryOfBase = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of catalog.data ?? []) map.set(baseOf(w.item_code), w.category || NO_CATEGORY);
    return map;
  }, [catalog.data]);
  const categoryOf = (b: Build) => (b.weapon ? categoryOfBase.get(baseOf(b.weapon)) ?? NO_CATEGORY : NO_CATEGORY);

  const all = builds ?? [];
  const typeList = useMemo(() => [...new Set([...options.types, ...all.flatMap((b) => b.content_type ? [b.content_type] : [])])], [options.types, all]);
  const authors = useMemo(() => [...new Set(all.flatMap((b) => b.author_name ? [b.author_name] : []))].sort((a, b) => a.localeCompare(b, "pt-BR")), [all]);

  // Contagens do filtro de armas respeitam os outros filtros (tipo, autor, busca), mas não o da própria arma.
  const nq = normalize(q.trim());
  const matchesOthers = (b: Build) =>
    (!onlyMine || b.owner_id === userId) &&
    (type === "all" || b.content_type === type) &&
    (author === "all" || b.author_name === author) &&
    (!nq || normalize(`${b.name} ${b.author_name ?? ""} ${b.description ?? ""}`).includes(nq));
  const base = all.filter(matchesOthers);
  const counts = (() => {
    const byCategory = new Map<string, number>(); const byWeapon = new Map<string, number>();
    for (const b of base) {
      const c = categoryOf(b); byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
      if (b.weapon) byWeapon.set(baseOf(b.weapon), (byWeapon.get(baseOf(b.weapon)) ?? 0) + 1);
    }
    return { byCategory, byWeapon, total: base.length };
  })();

  const uses = (b: Build) => usage?.get(b.id) ?? 0;
  const shown = base
    .filter((b) => (!category || categoryOf(b) === category) && (!weapon || (b.weapon && baseOf(b.weapon) === weapon)))
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "pt-BR")
      : sort === "recent" ? b.updated_at.localeCompare(a.updated_at)
      : uses(b) - uses(a) || b.updated_at.localeCompare(a.updated_at));

  const filtered = category !== null || weapon !== null || type !== "all" || author !== "all" || !!q || onlyMine;
  function reset() { setCategory(null); setWeapon(null); setType("all"); setAuthor("all"); setQ(""); setOnlyMine(false); setSort("popular"); }

  const canChange = (b: Build) => !!userId && (b.owner_id === userId || access.isAdmin);
  const openedBuild = opened ? all.find((b) => b.id === opened) ?? null : null;

  function refresh() {
    for (const key of ["builds", "build-groups", "build-usage", "event", "events", "managed-events"]) void qc.invalidateQueries({ queryKey: [key] });
  }
  function startNew() {
    if (!access.session) { setNeedLogin(true); return; }
    setEditing({ key: `new-${Date.now()}`, draft: { ...emptyBuildDraft(), content_type: type !== "all" ? type : null } });
  }
  function startDuplicate(b: Build) {
    if (!access.session) { setNeedLogin(true); return; }
    setOpened(null);
    // Nova build (sem id): sai do mesmo desenho, mas com nome de cópia e o autor em branco para você assinar.
    setEditing({ key: `copy-${Date.now()}`, copyOf: b.name, draft: { ...draftFromBuild(b), name: `${b.name} (cópia)`.slice(0, 60), author_name: "" } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startEdit(b: Build) { setOpened(null); setEditing({ key: b.id, id: b.id, draft: draftFromBuild(b) }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function remove(b: Build) {
    if (!confirm(`Apagar a build "${b.name}"? Conteúdos que usam ela ficam sem build.`)) return;
    const { error } = await supabase.from("builds").delete().eq("id", b.id);
    if (error) { toast.error("Não foi possível apagar a build."); return; }
    toast.success("Build apagada.");
    setOpened(null);
    refresh();
  }

  if (needLogin && !access.session && !access.loading) {
    return <div><AuthForm redirectPath="/builds" title="Entre para criar builds" />
      <p className="text-center"><Button variant="ghost" onClick={() => setNeedLogin(false)}>Voltar às builds</Button></p></div>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gold">Builds</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escolha a arma e o tipo de conteúdo para achar a build. Qualquer pessoa com conta pode criar a sua.</p>
        </div>
        <div className="flex gap-2">
          {tab === "builds" && <Button variant="gold" onClick={startNew}><Plus /> Nova build</Button>}
          {access.session && <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-6">
        <TabsList>
          <TabsTrigger value="builds">Builds</TabsTrigger>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "grupos" && <div className="mt-5"><BuildGroupsPanel userId={userId} isAdmin={access.isAdmin} onNeedLogin={() => setNeedLogin(true)} /></div>}

      {tab === "builds" && <>
      {editing && <BuildEditor key={editing.key} id={editing.id} copyOf={editing.copyOf} initial={editing.draft} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}

      <div className="mt-8">
        <BuildWeaponFilter groups={groups} counts={counts} category={category} weapon={weapon}
          onCategory={(c) => { setCategory(c); setWeapon(null); }} onWeapon={setWeapon} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <Input aria-label="Buscar builds" placeholder="Buscar por nome, autor ou descrição…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Tipo de conteúdo"><SelectValue placeholder="Tipo de conteúdo" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os conteúdos</SelectItem>{typeList.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger aria-label="Autor"><SelectValue placeholder="Autor" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os autores</SelectItem>{authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger aria-label="Ordenar por"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Mais usadas</SelectItem>
            <SelectItem value="recent">Atualizadas recentemente</SelectItem>
            <SelectItem value="name">Nome (A–Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><Switch checked={showGear} onCheckedChange={setShowGear} aria-label="Mostrar equipamentos nos cartões" />Equipamentos nos cartões</label>
        {userId && <Button size="sm" variant={onlyMine ? "secondary" : "outline"} aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>Minhas builds</Button>}
        <Button size="sm" variant="ghost" disabled={!filtered} onClick={reset}><RotateCcw /> Limpar filtros</Button>
        <span className="ml-auto text-muted-foreground" aria-live="polite">{shown.length} {shown.length === 1 ? "build" : "builds"}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isPending && <p className="text-muted-foreground">Carregando builds...</p>}
        {isError && <p role="alert" className="text-destructive sm:col-span-2 lg:col-span-3">Não foi possível carregar as builds. Confira se as migrações 0003 e 0005 foram executadas no Supabase.</p>}
        {!isPending && !isError && shown.length === 0 && <p className="text-muted-foreground sm:col-span-2 lg:col-span-3">Nenhuma build encontrada{filtered ? " com esses filtros" : ""}.{" "}
          {filtered && <button type="button" className="text-primary underline" onClick={reset}>Limpar filtros</button>}</p>}
        {shown.map((b) => <BuildCard key={b.id} build={b} uses={uses(b)} showGear={showGear} mine={b.owner_id === userId} onOpen={() => setOpened(b.id)} />)}
      </div>

      <BuildDialog build={openedBuild} uses={openedBuild ? uses(openedBuild) : 0} canChange={openedBuild ? canChange(openedBuild) : false}
        onClose={() => setOpened(null)} onEdit={startEdit} onDelete={remove} onDuplicate={startDuplicate} />
      </>}
    </main>
  );
}
