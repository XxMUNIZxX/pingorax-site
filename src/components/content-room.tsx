import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hash, Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Send, Settings, Trash2, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useMyNick } from "@/components/require-login";
import { useVoice, type Person, type ScreenShare } from "@/components/use-voice";
import { VoiceSettingsDialog } from "@/components/voice-settings-dialog";
import { CHAT_MAX, cleanMessage, fetchChat, mergeMessages, sendChat, type ChatMessage } from "@/lib/chat";
import { getVoiceStatus } from "@/lib/voice.functions";
import { chatTime, groupMessages, keyLabel, loadVoiceSettings, nickHue, nickInitial, saveVoiceSettings, volumeKey, type VoiceSettings } from "@/lib/voice-settings";

const label = "px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground";

function Avatar({ nick, size = 32, speaking = false }: { nick: string; size?: number; speaking?: boolean }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${speaking ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-background" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${nickHue(nick)} 55% 38%)` }}>{nickInitial(nick)}</span>
  );
}

/** Vídeo de uma tela compartilhada por outra pessoa. */
function ScreenView({ screen }: { screen: ScreenShare }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    screen.track.attach(el);
    return () => { screen.track.detach(el); };
  }, [screen.track]);
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-black">
      <video ref={ref} autoPlay playsInline controls className="max-h-[45vh] w-full object-contain" />
      <figcaption className="bg-card/80 px-3 py-1 text-xs text-muted-foreground">Tela de {screen.name}</figcaption>
    </figure>
  );
}

/** Uma pessoa na sala de voz. Clicar no nome abre o volume dela. */
function PersonRow({ person, settings, onChange }: { person: Person; settings: VoiceSettings; onChange: (patch: Partial<VoiceSettings>) => void }) {
  const volume = settings.volumes[volumeKey(person.name)] ?? 1;
  const body = (
    <>
      <Avatar nick={person.name} size={26} speaking={person.speaking} />
      <span className="min-w-0 flex-1 truncate text-left text-sm">{person.name}{person.me ? " (você)" : ""}</span>
      {person.muted && <MicOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Mudo" />}
    </>
  );
  if (person.me) return <li className="flex items-center gap-2 rounded-md px-2 py-1">{body}</li>;
  return (
    <li>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5" aria-label={`Volume de ${person.name}`}>{body}</button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-3" align="start">
          <div className="flex items-center justify-between text-sm"><b className="truncate">{person.name}</b><span>{Math.round(volume * 100)}%</span></div>
          <Slider aria-label={`Volume de ${person.name}`} min={0} max={200} step={5} value={[Math.round(volume * 100)]}
            onValueChange={([v]) => onChange({ volumes: { ...settings.volumes, [volumeKey(person.name)]: (v ?? 100) / 100 } })} />
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ volumes: Object.fromEntries(Object.entries(settings.volumes).filter(([k]) => k !== volumeKey(person.name))) })}>Voltar para 100%</Button>
        </PopoverContent>
      </Popover>
    </li>
  );
}

/** Chat e voz do conteúdo, no estilo do Discord: canais à esquerda, conversa à direita. */
export function ContentRoom({ eventId, canModerate }: { eventId: string; canModerate: boolean }) {
  const qc = useQueryClient();
  const me = useMyNick();
  const status = useQuery({ queryKey: ["voice-status"], queryFn: () => getVoiceStatus(), staleTime: 10 * 60_000, retry: false });
  const chatKey = ["chat", eventId];
  const chat = useQuery({ queryKey: chatKey, queryFn: () => fetchChat(eventId), retry: false });
  const [settings, setSettings] = useState<VoiceSettings>(loadVoiceSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const voice = useVoice(eventId, settings);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const messages = chat.data ?? [];

  const change = (patch: Partial<VoiceSettings>) => setSettings((s) => { const next = { ...s, ...patch }; saveVoiceSettings(next); return next; });

  useEffect(() => {
    if (chat.data === null) return; // chat não instalado
    const channel = supabase
      .channel(`chat-${eventId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_messages", filter: `event_id=eq.${eventId}` }, (payload) => {
        qc.setQueryData<ChatMessage[] | null>(chatKey, (old) => mergeMessages(old ?? [], [payload.new as ChatMessage]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "event_messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) qc.setQueryData<ChatMessage[] | null>(chatKey, (old) => (old ?? []).filter((m) => m.id !== id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, chat.data === null]);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);

  const chatOn = chat.data !== null && !chat.isError && !!me.nick;
  const voiceOn = !!status.data?.enabled && me.status === "ready";
  if (!chatOn && !voiceOn) return null;
  const nick = me.nick ?? "Você";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = cleanMessage(text);
    if (!body) { toast.error(`Escreva de 1 a ${CHAT_MAX} caracteres.`); return; }
    setSending(true);
    try {
      const sent = await sendChat(eventId, body);
      setText("");
      qc.setQueryData<ChatMessage[] | null>(chatKey, (old) => mergeMessages(old ?? [], [sent]));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Não consegui enviar.");
    } finally { setSending(false); }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("event_messages").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.setQueryData<ChatMessage[] | null>(chatKey, (old) => (old ?? []).filter((m) => m.id !== id));
  }

  const iconBtn = "h-8 w-8 shrink-0";
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card/40 md:grid md:grid-cols-[15.5rem_1fr]" aria-label="Sala do conteúdo">
      <div ref={voice.audioHost} className="hidden" aria-hidden="true" />
      <aside className="flex flex-col border-b border-border bg-background/60 md:border-b-0 md:border-r">
        <h2 className="border-b border-border px-3 py-2.5 text-sm font-bold">Sala do conteúdo</h2>
        <div className="flex-1 space-y-4 py-3">
          {chatOn && (
            <div>
              <p className={label}>Texto</p>
              <div className="mx-2 flex items-center gap-1.5 rounded-md bg-secondary/80 px-2 py-1.5 text-sm font-semibold"><Hash className="h-4 w-4 text-muted-foreground" /> chat</div>
            </div>
          )}
          {voiceOn && (
            <div>
              <p className={label}>Voz</p>
              {!voice.connected ? (
                <button type="button" onClick={() => void voice.join()} disabled={voice.joining} className="mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-semibold hover:bg-white/5 disabled:opacity-60">
                  <Volume2 className="h-4 w-4 text-muted-foreground" /> {voice.joining ? "Entrando..." : "Sala de voz"}
                  <span className="ml-auto text-[11px] font-normal text-primary">{voice.joining ? "" : "Entrar"}</span>
                </button>
              ) : (
                <>
                  <div className="mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold"><Volume2 className="h-4 w-4 text-emerald-400" /> Sala de voz</div>
                  <ul className="mx-2 space-y-0.5 pl-3" aria-label="Quem está na sala">
                    {voice.people.map((p) => <PersonRow key={p.id} person={p} settings={settings} onChange={change} />)}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {voiceOn && (
          <div className="border-t border-border bg-black/25 p-2">
            <div className="flex items-center gap-2">
              <Avatar nick={nick} size={32} speaking={voice.people.some((p) => p.me && p.speaking)} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold">{nick}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {!voice.connected ? "Fora da voz" : settings.mode === "ptt" ? (voice.talking ? "Falando" : `Segure ${keyLabel(settings.pttKey)} para falar`) : voice.muted ? "Mudo" : "Microfone aberto"}
                </p>
              </div>
              <Button type="button" size="icon" variant={voice.muted ? "destructive" : "ghost"} className={iconBtn} disabled={!voice.connected} onClick={voice.toggleMute} aria-label={voice.muted ? "Ligar o microfone" : "Silenciar o microfone"} aria-pressed={voice.muted}>{voice.muted ? <MicOff /> : <Mic />}</Button>
              <Button type="button" size="icon" variant={voice.deafened ? "destructive" : "ghost"} className={iconBtn} disabled={!voice.connected} onClick={voice.toggleDeafen} aria-label={voice.deafened ? "Voltar a ouvir" : "Ensurdecer (parar de ouvir)"} aria-pressed={voice.deafened}>{voice.deafened ? <HeadphoneOff /> : <Headphones />}</Button>
              <Button type="button" size="icon" variant="ghost" className={iconBtn} onClick={() => setSettingsOpen(true)} aria-label="Ajustes de voz"><Settings /></Button>
            </div>
            {voice.connected && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant={voice.sharing ? "secondary" : "outline"} onClick={() => void voice.toggleShare()}>{voice.sharing ? <MonitorX /> : <MonitorUp />} {voice.sharing ? "Parar" : "Tela"}</Button>
                <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={voice.leave}><PhoneOff /> Sair</Button>
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="flex h-[30rem] min-w-0 flex-col">
        {chatOn ? (
          <>
            <header className="flex flex-wrap items-center gap-x-2 border-b border-border px-4 py-2.5">
              <Hash className="h-4 w-4 text-muted-foreground" /><h3 className="font-bold">chat</h3>
              <span className="text-xs text-muted-foreground">ao vivo · só quem pingou escreve</span>
            </header>
            {voice.screens.length > 0 && <div className="space-y-2 border-b border-border p-3">{voice.screens.map((s) => <ScreenView key={s.id} screen={s} />)}</div>}
            <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3" role="log" aria-live="polite">
              {chat.isLoading && <p className="px-2 text-sm text-muted-foreground">Carregando o chat...</p>}
              {!chat.isLoading && messages.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  <Hash className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="font-semibold text-foreground">Comece a conversa</p>
                  <p>Combine o ponto de encontro, a build e o horário aqui.</p>
                </div>
              )}
              {groupMessages(messages).map((g) => (
                <div key={g.first.id} className="flex gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
                  <Avatar nick={g.nick} />
                  <div className="min-w-0 flex-1">
                    <p className="leading-tight"><b style={{ color: `hsl(${nickHue(g.nick)} 70% 72%)` }}>{g.nick}</b> <span className="ml-1 text-[11px] text-muted-foreground">{chatTime(g.first.created_at)}</span></p>
                    {g.items.map((m) => (
                      <div key={m.id} className="group flex items-start gap-2">
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
                        {canModerate && <button type="button" onClick={() => void remove(m.id)} aria-label="Apagar mensagem" className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={submit} className="p-3 pt-0">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/60 pl-3 pr-1">
                <input className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground" placeholder={`Conversar em #chat como ${nick}`} aria-label="Mensagem" value={text} onChange={(e) => setText(e.target.value)} maxLength={CHAT_MAX} />
                <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" disabled={sending || !text.trim()} aria-label="Enviar"><Send /></Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-sm text-muted-foreground">O chat ainda não está ativo. A sala de voz está ao lado.</p>
            {voice.screens.map((s) => <ScreenView key={s.id} screen={s} />)}
          </div>
        )}
      </div>

      {voiceOn && <VoiceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={change} connected={voice.connected} />}
    </section>
  );
}
