import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MAX_GUILDS_PER_USER, SLUG_PATTERN, fetchMyGuilds, slugify, type Guild } from "@/lib/guilds";
import { copyText } from "@/lib/share-text";
import { SHARE_ORIGIN } from "@/lib/share-image";

export const myGuildsKey = (userId: string) => ["my-guilds", userId];
export const useMyGuilds = (userId: string) => useQuery({ queryKey: myGuildsKey(userId), queryFn: () => fetchMyGuilds(userId), retry: false });

type Form = { id?: string; name: string; slug: string; description: string; slugTouched: boolean };

/** "Minha guilda": cria a página pública /g/<endereço> onde aparecem os próximos conteúdos. Some se a migração 0013 não foi rodada. */
export function GuildPanel({ userId, canCreate }: { userId: string; canCreate: boolean }) {
  const qc = useQueryClient();
  const { data: guilds } = useMyGuilds(userId);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  if (!guilds) return null;
  if (guilds.length === 0 && !canCreate) return null;

  const link = (g: Guild) => `${SHARE_ORIGIN}/g/${g.slug}`;
  const set = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["my-guilds"] }); void qc.invalidateQueries({ queryKey: ["guild-events"] }); };

  async function save() {
    if (!form) return;
    const name = form.name.trim();
    if (name.length < 2) { toast.error("Digite o nome da guilda."); return; }
    if (!SLUG_PATTERN.test(form.slug)) { toast.error("O endereço precisa ter de 3 a 30 letras minúsculas, números ou hífen."); return; }
    setSaving(true);
    try {
      const fields = { name, description: form.description.trim() || null };
      const { error } = form.id
        ? await supabase.from("guilds").update(fields).eq("id", form.id)
        : await supabase.from("guilds").insert({ ...fields, slug: form.slug });
      if (error) {
        toast.error(error.code === "23505" ? "Esse endereço já está em uso. Troque o endereço da guilda." : error.code === "42501" ? "Você não pode criar mais guildas." : "Não foi possível salvar a guilda.");
        return;
      }
      toast.success(form.id ? "Guilda atualizada." : "Guilda criada!");
      setForm(null); refresh();
    } finally { setSaving(false); }
  }

  async function remove(g: Guild) {
    if (!confirm(`Apagar a guilda "${g.name}"? Os conteúdos continuam, só saem da página dela.`)) return;
    const { error } = await supabase.from("guilds").delete().eq("id", g.id);
    if (error) { toast.error("Não foi possível apagar a guilda."); return; }
    toast.success("Guilda apagada."); refresh();
  }

  return (
    <section className="panel mt-6 p-4" aria-label="Minha guilda">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Minha guilda</h2>
        {canCreate && guilds.length < MAX_GUILDS_PER_USER && !form && <Button size="sm" variant="outline" onClick={() => setForm({ name: "", slug: "", description: "", slugTouched: false })}>Criar página de guilda</Button>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Cada guilda ganha uma página pública (/g/endereço) com os próximos conteúdos. Escolha a guilda ao criar ou editar um conteúdo.</p>

      {guilds.map((g) => (
        <div key={g.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
          <div className="min-w-0"><p className="break-words font-semibold">{g.name}</p><Link to="/g/$slug" params={{ slug: g.slug }} className="break-all text-primary hover:underline">/g/{g.slug}</Link></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={async () => { const ok = await copyText(link(g)); if (ok) toast.success("Link da guilda copiado!"); else toast.error("Não consegui copiar."); }}>Copiar link</Button>
            <Button size="sm" variant="secondary" onClick={() => setForm({ id: g.id, name: g.name, slug: g.slug, description: g.description ?? "", slugTouched: true })}>Editar</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(g)}>Apagar</Button>
          </div>
        </div>
      ))}

      {form && (
        <fieldset disabled={saving} className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="space-y-1"><Label htmlFor="guild-name">Nome da guilda</Label><Input id="guild-name" maxLength={60} value={form.name} onChange={(e) => set({ name: e.target.value, ...(form.slugTouched || form.id ? {} : { slug: slugify(e.target.value) }) })} /></div>
          <div className="space-y-1">
            <Label htmlFor="guild-slug">Endereço</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="shrink-0">pingorax.online/g/</span>
              <Input id="guild-slug" maxLength={30} disabled={!!form.id} value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""), slugTouched: true })} /></div>
            {form.id && <p className="text-xs text-muted-foreground">O endereço não muda depois de criado, para os links já compartilhados continuarem valendo.</p>}
          </div>
          <div className="space-y-1"><Label htmlFor="guild-desc">Descrição (opcional)</Label><Textarea id="guild-desc" maxLength={500} placeholder="Quem somos, horários, requisitos…" value={form.description} onChange={(e) => set({ description: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button><Button variant="gold" onClick={() => void save()}>{saving ? "Salvando..." : "Salvar"}</Button></div>
        </fieldset>
      )}
    </section>
  );
}
