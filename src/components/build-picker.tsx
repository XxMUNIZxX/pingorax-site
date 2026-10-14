import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Swords, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuildGear, useItemNames } from "@/components/build-view";
import { ItemSlot } from "@/components/item-slot";
import { BUILD_SLOTS, baseOf, fetchBuilds, normalize, type Build, type SlotKey } from "@/lib/builds";
import { useContentOptions } from "@/lib/content-options";

const GEAR_ROW: SlotKey[] = ["offhand", "helmet", "armor", "boots", "cape", "potion", "food", "mount"];

/** Botão que mostra a build escolhida e abre a janela de busca/visualização. */
export function BuildPicker({ value, weaponName, weaponCode, onChange }: {
  value: string | null | undefined; weaponName: string; weaponCode?: string | null | undefined; onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const builds = useQuery({ queryKey: ["builds"], queryFn: fetchBuilds, staleTime: 30_000 });
  const current = value ? builds.data?.find((b) => b.id === value) ?? null : null;

  return (
    <>
      <Button type="button" variant="outline" className="h-12 w-44 shrink-0 justify-start gap-2 px-2" onClick={() => setOpen(true)}
        aria-label={`Build da arma ${weaponName || ""}: ${current ? current.name : value ? "build atual" : "nenhuma"}. Escolher build`}>
        {current?.weapon ? <ItemSlot code={current.weapon} size={32} showTier={false} /> : <Swords className="h-5 w-5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-left text-sm">{current ? current.name : value ? "Build atual" : "Escolher build"}</span>
      </Button>
      <BuildPickerDialog open={open} onClose={() => setOpen(false)} value={value ?? null} weaponName={weaponName} weaponCode={weaponCode ?? null}
        builds={builds.data ?? []} loading={builds.isLoading} error={builds.isError} onChange={onChange} />
    </>
  );
}

function BuildPickerDialog({ open, onClose, value, weaponName, weaponCode, builds, loading, error, onChange }: {
  open: boolean; onClose: () => void; value: string | null; weaponName: string; weaponCode: string | null;
  builds: Build[]; loading: boolean; error: boolean; onChange: (id: string | null) => void;
}) {
  const nameOf = useItemNames();
  const options = useContentOptions();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [sameWeapon, setSameWeapon] = useState(false);
  const [selected, setSelected] = useState<string | null>(value);
  const weaponBase = weaponCode ? baseOf(weaponCode) : null;
  const hasMatches = !!weaponBase && builds.some((b) => b.weapon && baseOf(b.weapon) === weaponBase);

  useEffect(() => {
    if (!open) return;
    setQ(""); setType("all"); setSelected(value); setSameWeapon(hasMatches);
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const typeList = useMemo(() => [...new Set([...options.types, ...builds.flatMap((b) => b.content_type ? [b.content_type] : [])])], [options.types, builds]);
  const nq = normalize(q.trim());
  const shown = builds.filter((b) =>
    (type === "all" || b.content_type === type) &&
    (!sameWeapon || !weaponBase || (b.weapon && baseOf(b.weapon) === weaponBase)) &&
    (!nq || normalize(`${b.name} ${b.author_name ?? ""} ${b.content_type ?? ""} ${b.weapon ? nameOf(b.weapon) : ""}`).includes(nq)));
  const preview = builds.find((b) => b.id === selected) ?? null;
  const unchanged = selected === value;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolher build{weaponName ? ` para ${weaponName}` : ""}</DialogTitle>
          <DialogDescription>Busque, clique para visualizar e confirme para ligar a build a esta arma.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Input autoFocus className="min-w-0 flex-1 basis-40" aria-label="Buscar build" placeholder="Buscar por nome, autor, arma…" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-44" aria-label="Tipo de conteúdo"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos os conteúdos</SelectItem>{typeList.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {weaponBase && (
              <div className="mt-2"><Button type="button" size="sm" variant={sameWeapon ? "secondary" : "outline"} aria-pressed={sameWeapon} disabled={!hasMatches && !sameWeapon} onClick={() => setSameWeapon(!sameWeapon)}>
                Só builds desta arma{!hasMatches ? " (nenhuma ainda)" : ""}</Button></div>
            )}
            <ul className="mt-3 grid max-h-[50vh] gap-2 overflow-y-auto pr-1" aria-label="Builds">
              {loading && <li className="text-sm text-muted-foreground">Carregando builds…</li>}
              {error && <li role="alert" className="text-sm text-destructive">Não foi possível carregar as builds.</li>}
              {!loading && !error && shown.length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhuma build encontrada. <Link to="/builds" className="text-primary underline">Criar uma build</Link></li>
              )}
              {shown.map((b) => {
                const on = b.id === selected;
                return (
                  <li key={b.id}>
                    <button type="button" aria-pressed={on} onClick={() => setSelected(b.id)} onDoubleClick={() => { onChange(b.id); onClose(); }}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-lg border p-2 text-left transition hover:border-primary ${on ? "border-primary bg-secondary ring-1 ring-primary" : "border-border bg-card"}`}>
                      <ItemSlot code={b.weapon} label="Arma" size={52} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-semibold">{b.name}</span>
                          {b.content_type && <Badge variant="outline" className="border-primary/50 text-primary">{b.content_type}</Badge>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{[b.weapon ? nameOf(b.weapon) : null, b.author_name ? `por ${b.author_name}` : null].filter(Boolean).join(" · ")}</span>
                        <span className="mt-1 flex gap-1" aria-hidden>
                          {GEAR_ROW.map((key) => <ItemSlot key={key} code={b[key]} size={22} showTier={false} />)}
                        </span>
                      </span>
                      {value === b.id && <Badge variant="secondary">Atual</Badge>}
                      {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="min-w-0 rounded-xl border border-border bg-background/50 p-3" aria-label="Pré-visualização da build">
            {preview ? (
              <div className="space-y-3">
                <div>
                  <h3 className="break-words font-bold">{preview.name}</h3>
                  <p className="text-xs text-muted-foreground">{[preview.content_type, preview.author_name ? `por ${preview.author_name}` : null].filter(Boolean).join(" · ") || "Build"}</p>
                </div>
                {preview.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{preview.description}</p>}
                <BuildGear build={preview} size={56} />
                <ul className="space-y-0.5 text-xs">
                  {BUILD_SLOTS.filter((slot) => preview[slot.key]).map((slot) => (
                    <li key={slot.key} className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">{slot.label}</span><span className="min-w-0 break-words">{nameOf(preview[slot.key]!)}</span></li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{value && !builds.some((b) => b.id === value) ? "A build atual não existe mais. Escolha outra ou remova." : "Clique em uma build para visualizar."}</p>
            )}
          </aside>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="text-destructive" disabled={!value} onClick={() => { onChange(null); onClose(); }}><X /> Sem build</Button>
            <Button type="button" variant="ghost" size="sm" asChild><Link to="/builds"><ExternalLink /> Abrir aba Builds</Link></Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="button" variant="gold" disabled={!selected || unchanged} onClick={() => { onChange(selected); onClose(); }}>Usar esta build</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
