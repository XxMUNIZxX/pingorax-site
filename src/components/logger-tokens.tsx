import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyText } from "@/lib/share-text";

const missing = (e: { message?: string | undefined; code?: string | undefined } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42501" || /logger_tokens|logger_create_token/i.test(e.message ?? ""));

/** Tokens do programa do caller (loot e dps). Só aparece para quem cria/edita conteúdo e depois da migração 0022. */
export function LoggerTokens({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("Meu PC");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const access = useQuery({ queryKey: ["content-access", userId], retry: false, queryFn: async () => { const { data } = await supabase.rpc("can_access_content_panel"); return data === true; } });
  const tokens = useQuery({
    queryKey: ["logger-tokens", userId], retry: false, enabled: access.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("logger_tokens").select("id,label,created_at,last_used_at").order("created_at");
      if (error) { if (missing(error)) return null; throw error; }
      return data ?? [];
    },
  });
  if (!access.data || tokens.data === null || tokens.isError) return null;

  async function create() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("logger_create_token", { _label: label });
      if (error) { toast.error(error.message.length < 120 ? error.message : "Não foi possível criar o token."); return; }
      setFresh(data); void qc.invalidateQueries({ queryKey: ["logger-tokens", userId] });
    } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!window.confirm("Apagar este token? O programa que o usa para de enviar dados.")) return;
    const { error } = await supabase.from("logger_tokens").delete().eq("id", id);
    if (error) toast.error("Não foi possível apagar."); else void qc.invalidateQueries({ queryKey: ["logger-tokens", userId] });
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card/50 p-4" aria-label="Token do programa de loot e dps">
      <h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="h-4 w-4 text-primary" /> Programa de loot e dps</h2>
      <p className="mt-1 text-sm text-muted-foreground">O token deixa o programa do seu PC enviar loot e dps direto para os seus conteúdos. Trate como senha: quem tiver o token consegue enviar dados para os conteúdos que você edita.</p>
      {fresh && (
        <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-3">
          <p className="text-sm font-semibold">Copie agora. Ele não aparece de novo.</p>
          <div className="mt-2 flex gap-2"><Input readOnly value={fresh} aria-label="Token novo" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={async () => { if (await copyText(fresh)) toast.success("Copiado."); else toast.error("Não consegui copiar. Selecione e copie à mão."); }}><Copy /></Button></div>
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setFresh(null)}>Já guardei</Button>
        </div>
      )}
      <ul className="mt-3 space-y-1 text-sm">
        {(tokens.data ?? []).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
            <span className="min-w-0 truncate"><b>{t.label}</b> · criado {new Date(t.created_at).toLocaleDateString("pt-BR")} · {t.last_used_at ? `usado ${new Date(t.last_used_at).toLocaleString("pt-BR")}` : "nunca usado"}</span>
            <Button type="button" size="sm" variant="ghost" aria-label={`Apagar ${t.label}`} onClick={() => void revoke(t.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input value={label} maxLength={40} aria-label="Nome do token" onChange={(e) => setLabel(e.target.value)} />
        <Button type="button" variant="gold" disabled={busy || !label.trim()} onClick={() => void create()}>Criar token</Button>
      </div>
    </section>
  );
}
