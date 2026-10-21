import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAT_MAX, cleanMessage, fetchChat, mergeMessages, sendChat, type ChatMessage } from "@/lib/chat";
import { timeAgo } from "@/lib/albion-types";

const NICK_KEY = "pingorax:chat-nick";
const readNick = () => { try { return localStorage.getItem(NICK_KEY) ?? ""; } catch { return ""; } };
const saveNick = (nick: string) => { try { localStorage.setItem(NICK_KEY, nick); } catch { /* sem armazenamento: tudo bem */ } };

/** Chat ao vivo do conteúdo. Só aparece quando a migração 0018 já foi rodada. */
export function EventChat({ eventId, canModerate }: { eventId: string; canModerate: boolean }) {
  const qc = useQueryClient();
  const key = ["chat", eventId];
  const chat = useQuery({ queryKey: key, queryFn: () => fetchChat(eventId), retry: false });
  const [nick, setNick] = useState(readNick);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const messages = chat.data ?? [];

  useEffect(() => {
    if (chat.data === null) return; // chat não instalado
    const channel = supabase
      .channel(`chat-${eventId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_messages", filter: `event_id=eq.${eventId}` }, (payload) => {
        qc.setQueryData<ChatMessage[] | null>(key, (old) => mergeMessages(old ?? [], [payload.new as ChatMessage]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "event_messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) qc.setQueryData<ChatMessage[] | null>(key, (old) => (old ?? []).filter((m) => m.id !== id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, chat.data === null]);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);

  if (chat.data === null || chat.isError) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = cleanMessage(text);
    const who = nick.trim();
    if (who.length < 2) { toast.error("Digite o nick com que você pingou."); return; }
    if (!body) { toast.error(`Escreva de 1 a ${CHAT_MAX} caracteres.`); return; }
    setSending(true);
    try {
      const sent = await sendChat(eventId, who, body);
      saveNick(who);
      setText("");
      qc.setQueryData<ChatMessage[] | null>(key, (old) => mergeMessages(old ?? [], [sent]));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Não consegui enviar.");
    } finally { setSending(false); }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("event_messages").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.setQueryData<ChatMessage[] | null>(key, (old) => (old ?? []).filter((m) => m.id !== id));
  }

  return (
    <section className="mt-8 border-t border-border pt-6" aria-label="Chat do conteúdo">
      <h2 className="flex items-center gap-2 text-xl font-bold"><MessageCircle className="h-5 w-5 text-primary" /> Chat <span className="text-sm font-normal text-muted-foreground">ao vivo · só quem pingou escreve</span></h2>
      <div ref={listRef} className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border bg-card/40 p-3" role="log" aria-live="polite">
        {chat.isLoading && <p className="text-sm text-muted-foreground">Carregando o chat...</p>}
        {!chat.isLoading && messages.length === 0 && <p className="text-sm text-muted-foreground">Ninguém falou ainda. Combine o ponto de encontro, a build e o horário aqui.</p>}
        {messages.map((m) => (
          <div key={m.id} className="group flex items-start gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-primary">{m.nick}</span> <span className="text-[11px] text-muted-foreground">{timeAgo(m.created_at)}</span>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
            {canModerate && <button type="button" onClick={() => void remove(m.id)} aria-label="Apagar mensagem" className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input className="sm:w-44" placeholder="Seu nick (o do ping)" aria-label="Seu nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={32} />
        <Input className="min-w-0 flex-1" placeholder="Escreva uma mensagem" aria-label="Mensagem" value={text} onChange={(e) => setText(e.target.value)} maxLength={CHAT_MAX} />
        <Button type="submit" variant="gold" disabled={sending}>{sending ? "Enviando..." : "Enviar"}</Button>
      </form>
    </section>
  );
}
