import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eraser, Recycle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetForReuse, reuseSummary } from "@/lib/cleanup";
import type { ChatMessage } from "@/lib/chat";

/** Limpa o que é descartável do conteúdo (chat, loot e dps) para ele poder ser usado de novo. Inscrições, builds e presença não são mexidas. */
export function ReuseBox({ eventId, canClearChat, canClearLoot }: { eventId: string; canClearChat: boolean; canClearLoot: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!canClearChat && !canClearLoot) return null;

  async function run(what: { chat: boolean; loot: boolean }, ask: string) {
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      const r = await resetForReuse(eventId, what);
      if (r.chat !== null) qc.setQueryData<ChatMessage[] | null>(["chat", eventId], (old) => (old === null ? null : []));
      if (r.loot !== null) void qc.invalidateQueries({ queryKey: ["loot", eventId] });
      (r.failed.length ? toast.error : toast.success)(reuseSummary(r));
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-8 rounded-xl border border-dashed border-border p-4" aria-label="Reutilizar conteúdo">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Recycle className="h-5 w-5 text-primary" /> Reutilizar este conteúdo</h2>
      <p className="mt-1 text-sm text-muted-foreground">Limpa o que sobrou da última vez. Quem pingou, as builds e a presença continuam como estão. Não dá para desfazer.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canClearChat && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run({ chat: true, loot: false }, "Apagar todas as mensagens do chat deste conteúdo?")}><Eraser /> Limpar chat</Button>}
        {canClearLoot && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run({ chat: false, loot: true }, "Apagar todo o loot, o dps e as divisões deste conteúdo?")}><Eraser /> Limpar loot e dps</Button>}
        {canClearChat && canClearLoot && <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void run({ chat: true, loot: true }, "Apagar o chat, o loot e o dps deste conteúdo para usar de novo?")}><Recycle /> Limpar tudo</Button>}
      </div>
    </section>
  );
}
