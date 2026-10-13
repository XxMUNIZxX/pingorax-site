import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRoundPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

export function EventEditorsDialog({ eventId, title }: { eventId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const editors = useQuery({ queryKey: ["event-editors", eventId], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.rpc("event_editor_directory", { _event_id: eventId });
    if (error) throw error;
    return data ?? [];
  } });
  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("grant_event_editor", { _event_id: eventId, _email: email.trim() });
      if (error) throw error;
      if (data === "not_found") { toast.error("Essa pessoa precisa criar e confirmar uma conta com esse email primeiro."); return; }
      if (data === "owner") { toast.error("O criador já tem acesso a este conteúdo."); return; }
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["event-editors", eventId] });
      toast.success("Permissão de edição liberada.");
    } catch { toast.error("Não foi possível liberar a edição."); }
    finally { setBusy(false); }
  }
  async function revoke(userId: string) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("revoke_event_editor", { _event_id: eventId, _user_id: userId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["event-editors", eventId] });
      toast.success("Permissão de edição removida.");
    } catch { toast.error("Não foi possível remover a permissão."); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline"><UserRoundPlus className="h-4 w-4" />Permissões</Button></DialogTrigger>
    <DialogContent className="min-w-0">
      <DialogHeader><DialogTitle>Permissões de edição</DialogTitle><DialogDescription className="break-words">{title}</DialogDescription></DialogHeader>
      <form onSubmit={grant} className="space-y-3">
        <Label htmlFor={`editor-email-${eventId}`}>Email da conta</Label>
        <Input id={`editor-email-${eventId}`} type="email" required autoComplete="email" placeholder="email@exemplo.com" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} />
        <Button variant="gold" type="submit" disabled={busy || !email.trim()}><UserRoundPlus className="h-4 w-4" />Liberar edição</Button>
      </form>
      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Editores autorizados</h3>
        {editors.isPending && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {editors.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as permissões.</p>}
        {editors.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum editor autorizado.</p>}
        {editors.data?.map(editor => <div key={editor.user_id} className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-all text-sm">{editor.email}</span>
          <Button variant="ghost" size="icon" className="shrink-0 text-destructive" title={`Remover acesso de ${editor.email}`} aria-label={`Remover acesso de ${editor.email}`} disabled={busy} onClick={() => revoke(editor.user_id)}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
      </div>
    </DialogContent>
  </Dialog>;
}