import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchContentOptions, type ContentKind, type ContentOption } from "@/lib/content-options";

const SECTIONS: { kind: ContentKind; title: string; description: string; placeholder: string }[] = [
  { kind: "mode", title: "Modos", description: "Opções do filtro e do campo \"PVP ou PVE\".", placeholder: "Ex.: PVP" },
  { kind: "type", title: "Tipos de conteúdo", description: "Opções do filtro e do campo \"Tipo de conteúdo\".", placeholder: "Ex.: BLACK ZONE" },
];

type Usage = Record<ContentKind, Map<string, number>>;

async function fetchUsage(): Promise<Usage> {
  const { data, error } = await supabase.from("events").select("mode,content_type");
  if (error) throw error;
  const usage: Usage = { mode: new Map(), type: new Map() };
  for (const row of data ?? []) {
    if (row.mode) usage.mode.set(row.mode, (usage.mode.get(row.mode) ?? 0) + 1);
    if (row.content_type) usage.type.set(row.content_type, (usage.type.get(row.content_type) ?? 0) + 1);
  }
  return usage;
}

export function ContentOptionsPanel() {
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["content-options"], queryFn: fetchContentOptions });
  const usage = useQuery({ queryKey: ["content-options-usage"], queryFn: fetchUsage });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["content-options"] });
    void qc.invalidateQueries({ queryKey: ["content-options-usage"] });
    void qc.invalidateQueries({ queryKey: ["events"] });
    void qc.invalidateQueries({ queryKey: ["managed-events"] });
  }

  return (
    <section className="mt-6 border-y border-border py-6">
      <h2 className="text-xl font-bold text-gold">Filtros dos conteúdos</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Edite as opções que aparecem nos filtros da página inicial e na criação de conteúdo. Renomear uma opção também
        atualiza os conteúdos que já usam ela.
      </p>
      {options.isError && <p role="alert" className="mt-3 text-sm text-destructive">Não foi possível carregar as opções. Confira se a migração do banco foi executada.</p>}
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <OptionGroup
            key={section.kind}
            {...section}
            loading={options.isPending}
            items={(options.data ?? []).filter((option) => option.kind === section.kind)}
            usage={usage.data?.[section.kind]}
            onChanged={refresh}
          />
        ))}
      </div>
    </section>
  );
}

function OptionGroup({ kind, title, description, placeholder, loading, items, usage, onChanged }: {
  kind: ContentKind;
  title: string;
  description: string;
  placeholder: string;
  loading: boolean;
  items: ContentOption[];
  usage: Map<string, number> | undefined;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    const position = items.reduce((max, item) => Math.max(max, item.position), 0) + 10;
    const { error } = await supabase.from("content_options").insert({ kind, name: clean, position });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "Essa opção já existe." : "Não foi possível adicionar a opção."); return; }
    setName("");
    toast.success("Opção adicionada.");
    onChanged();
  }

  return (
    <div className="min-w-0">
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <ul className="mt-3 space-y-2">
        {loading && <li className="text-sm text-muted-foreground">Carregando...</li>}
        {!loading && items.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma opção. O filtro fica sem escolhas.</li>}
        {items.map((item) => (
          <OptionRow key={`${item.id}-${item.name}`} item={item} used={usage?.get(item.name) ?? 0} onChanged={onChanged} />
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input aria-label={`Nova opção em ${title}`} placeholder={placeholder} maxLength={40} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" variant="gold" disabled={busy || !name.trim()}><Plus />Adicionar</Button>
      </form>
    </div>
  );
}

function OptionRow({ item, used, onChanged }: { item: ContentOption; used: number; onChanged: () => void }) {
  const [value, setValue] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const changed = value.trim() !== item.name;

  async function rename() {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_rename_content_option", { _id: item.id, _name: value });
    setBusy(false);
    if (error) { toast.error("Não foi possível renomear a opção."); return; }
    if (data === "duplicate") { toast.error("Já existe uma opção com esse nome."); return; }
    if (data === "invalid") { toast.error("O nome deve ter de 1 a 40 caracteres."); return; }
    if (data === "not_found") { toast.error("Essa opção não existe mais."); onChanged(); return; }
    toast.success("Opção renomeada.");
    onChanged();
  }

  async function remove() {
    const warning = used > 0
      ? `"${item.name}" está em ${used} ${used === 1 ? "conteúdo" : "conteúdos"}. Eles continuam com esse valor, mas ele some dos filtros e do editor. Remover mesmo assim?`
      : `Remover "${item.name}"?`;
    if (!confirm(warning)) return;
    setBusy(true);
    const { error } = await supabase.from("content_options").delete().eq("id", item.id);
    setBusy(false);
    if (error) { toast.error("Não foi possível remover a opção."); return; }
    toast.success("Opção removida.");
    onChanged();
  }

  return (
    <li className="flex items-center gap-2">
      <Input aria-label={`Nome da opção ${item.name}`} maxLength={40} value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && changed && value.trim()) void rename(); }} />
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{used} {used === 1 ? "uso" : "usos"}</span>
      <Button variant="outline" size="icon" title="Salvar nome" aria-label={`Salvar nome de ${item.name}`} disabled={busy || !changed || !value.trim()} onClick={rename}><Check /></Button>
      <Button variant="ghost" size="icon" className="text-destructive" title="Remover opção" aria-label={`Remover ${item.name}`} disabled={busy} onClick={remove}><Trash2 /></Button>
    </li>
  );
}
