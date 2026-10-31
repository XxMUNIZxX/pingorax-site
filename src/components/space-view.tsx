import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Ban, Compass, Copy, Crown, Eraser, Swords, Hash, Headphones, HeadphoneOff, LogOut, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Plus, Send, Settings, Shield, Trash2, UserPlus, Users, Volume2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, PersonRow, ScreenView } from "@/components/content-room";
import { useVoice } from "@/components/use-voice";
import { VoiceSettingsDialog } from "@/components/voice-settings-dialog";
import { getChannelVoiceToken, getVoiceStatus } from "@/lib/voice.functions";
import { mergeMessages } from "@/lib/chat";
import { formatDate } from "@/lib/events";
import { fetchMyPings } from "@/lib/my-pings";
import { chatTime, groupMessages, keyLabel, loadVoiceSettings, nickHue, saveVoiceSettings, type VoiceSettings } from "@/lib/voice-settings";
import {
  SPACE_MESSAGE_MAX, canModerate, clearChannel, createChannel, createInvite, deleteChannel, deleteSpaceMessage, fetchChannels, fetchInvites, fetchSpaceMembers, fetchSpaceMessages,
  banMember, fetchOpenSpaces, inviteLink, joinOpenSpace, removeMember, revokeInvite, sendSpaceMessage, setMemberRole, toMessage,
  type Channel, type Space, type SpaceMember, type SpaceMessage,
} from "@/lib/spaces";

const head = "px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
const err = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Algo deu errado.");
const GUILD_KEY = "pingorax.sala.guild";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

type Tab = "canais" | "conversa" | "membros";

/** Espaço da guilda no estilo do Discord: guildas, canais, conversa e membros. */
export function SpaceView({ userId, spaces }: { userId: string; spaces: Space[] }) {
  const qc = useQueryClient();
  const [guildSlug, setGuildSlug] = useState<string | null>(() => read(GUILD_KEY));
  const space = spaces.find((s) => s.slug === guildSlug) ?? spaces[0];
  const [textId, setTextId] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("conversa");
  const [settings, setSettings] = useState<VoiceSettings>(loadVoiceSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [newKind, setNewKind] = useState<"text" | "voice" | null>(null);
  const [exploreOpen, setExploreOpen] = useState(false);
  const status = useQuery({ queryKey: ["voice-status"], queryFn: () => getVoiceStatus(), staleTime: 10 * 60_000, retry: false });
  const channels = useQuery({ queryKey: ["channels", space?.id], queryFn: () => fetchChannels(space!.id), enabled: !!space });
  const members = useQuery({ queryKey: ["space-members", space?.id], queryFn: () => fetchSpaceMembers(space!.id), enabled: !!space });
  const me = members.data?.find((m) => m.user_id === userId);
  const myName = me?.name ?? "Você";
  const pings = useQuery({ queryKey: ["my-pings", me?.nick], queryFn: () => fetchMyPings(me!.nick!), enabled: !!me?.nick, staleTime: 60_000, retry: false });
  const myContents = (pings.data?.upcoming ?? []).slice(0, 6);
  const mod = !!space && canModerate(space.role);
  const voiceOn = !!status.data?.enabled;

  const texts = (channels.data ?? []).filter((c) => c.kind === "text");
  const voices = (channels.data ?? []).filter((c) => c.kind === "voice");
  const textChannel = texts.find((c) => c.id === textId) ?? texts[0];

  const voice = useVoice(voiceId ?? "none", () => getChannelVoiceToken({ data: { channelId: voiceId ?? "" } }), settings);
  const change = (patch: Partial<VoiceSettings>) => setSettings((s) => { const next = { ...s, ...patch }; saveVoiceSettings(next); return next; });

  // Escolheu um canal de voz: entra (sair do anterior é automático).
  useEffect(() => { if (voiceId) void voice.join(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [voiceId]);
  // Trocar de guilda sai da voz.
  useEffect(() => { setVoiceId(null); setTextId(null); }, [space?.id]);

  if (!space) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Sala</h1>
        <p className="mt-3 text-muted-foreground">Você ainda não está em nenhum espaço. Entre num espaço público abaixo, peça um link de convite a quem manda na sua guilda ou crie a sua em <Link to="/criar" className="text-primary underline">Criar conteúdo</Link>.</p>
        <div className="mt-6 text-left"><OpenSpaceList joined={[]} onJoined={(slug) => { write(GUILD_KEY, slug); void qc.invalidateQueries({ queryKey: ["spaces", userId] }); }} /></div>
      </main>
    );
  }

  const pickGuild = (s: Space) => { setGuildSlug(s.slug); write(GUILD_KEY, s.slug); setTab("canais"); };
  const refreshChannels = () => qc.invalidateQueries({ queryKey: ["channels", space.id] });
  const refreshMembers = () => qc.invalidateQueries({ queryKey: ["space-members", space.id] });

  async function leaveGuild() {
    if (!window.confirm(`Sair da guilda ${space!.name}?`)) return;
    try { await removeMember(space!.id, userId); voice.leave(); await qc.invalidateQueries({ queryKey: ["spaces", userId] }); toast.success("Você saiu da guilda."); }
    catch (e) { toast.error(err(e)); }
  }
  async function dropChannel(c: Channel) {
    if (!window.confirm(`Apagar o canal ${c.kind === "text" ? "#" : ""}${c.name} e tudo que há nele?`)) return;
    try { if (voiceId === c.id) { voice.leave(); setVoiceId(null); } await deleteChannel(c.id); await refreshChannels(); }
    catch (e) { toast.error(err(e)); }
  }

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`flex-1 px-3 py-2 text-sm font-semibold ${tab === id ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}>{label}</button>
  );
  const show = (id: Tab) => (tab === id ? "flex" : "hidden md:flex");

  return (
    <main className="mx-auto max-w-[96rem] px-2 py-4 sm:px-4">
      <div ref={voice.audioHost} className="hidden" aria-hidden="true" />
      <div className="mb-1 flex border-b border-border md:hidden" role="group" aria-label="Seção">{tabBtn("canais", "Canais")}{tabBtn("conversa", "Conversa")}{tabBtn("membros", "Membros")}</div>
      <section className="overflow-hidden rounded-2xl border border-border bg-card/40 md:grid md:h-[calc(100dvh-9rem)] md:min-h-[32rem] md:grid-cols-[4.25rem_15.5rem_minmax(0,1fr)_14.5rem]" aria-label={`Espaço de ${space.name}`}>
        {/* 1. guildas */}
        <nav aria-label="Suas guildas" className="hidden gap-2 overflow-y-auto border-r border-border bg-black/30 py-3 md:flex md:flex-col md:items-center">
          {spaces.map((s) => (
            <button key={s.id} type="button" onClick={() => pickGuild(s)} title={s.name} aria-label={s.name} aria-current={s.id === space.id ? "true" : undefined}
              className={`grid h-11 w-11 place-items-center text-sm font-extrabold text-white transition-all ${s.id === space.id ? "rounded-xl ring-2 ring-primary" : "rounded-full opacity-80 hover:rounded-xl hover:opacity-100"}`}
              style={{ background: `hsl(${nickHue(s.name)} 45% 32%)` }}>{s.name.slice(0, 2).toUpperCase()}</button>
          ))}
          <button type="button" onClick={() => setExploreOpen(true)} title="Explorar espaços públicos" aria-label="Explorar espaços públicos" className="grid h-11 w-11 place-items-center rounded-full bg-secondary/60 text-emerald-400 hover:rounded-xl"><Compass className="h-5 w-5" /></button>
        </nav>

        {/* 2. canais */}
        <aside className={`${show("canais")} min-h-[28rem] flex-col border-b border-border bg-background/60 md:min-h-0 md:border-b-0 md:border-r`}>
          <div className="flex items-center gap-1 border-b border-border px-3 py-2.5">
            <h1 className="min-w-0 flex-1 truncate text-sm font-bold" title={space.name}>{space.name}</h1>
            {mod && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setInviteOpen(true)} aria-label="Convidar pessoas"><UserPlus /></Button>}
            {space.role !== "owner" && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => void leaveGuild()} aria-label="Sair da guilda"><LogOut /></Button>}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3">
            {(
              <div className="flex flex-wrap gap-1.5 px-3 md:hidden">{spaces.map((s) => <button key={s.id} type="button" onClick={() => pickGuild(s)} className={`rounded-full border px-2.5 py-1 text-xs ${s.id === space.id ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{s.name}</button>)}<button type="button" onClick={() => setExploreOpen(true)} className="rounded-full border border-border px-2.5 py-1 text-xs text-emerald-400">Explorar</button></div>
            )}
            {myContents.length > 0 && (
              <div>
                <p className={head}>Meus conteúdos</p>
                {myContents.map((p) => (
                  <Link key={p.id} to="/evento/$id" params={{ id: p.id }} className="mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground" title="Abrir o conteúdo (chat e voz dele ficam na página)">
                    <Swords className="h-4 w-4 shrink-0 text-gold" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-foreground">{p.title}</span><span className="block truncate text-[11px]">{formatDate(p.starts_at)}{p.status === "waitlist" ? " · na fila" : ""}</span></span>
                  </Link>
                ))}
              </div>
            )}
            <div>
              <div className="flex items-center pr-2"><p className={`${head} flex-1`}>Texto</p>{mod && <button type="button" onClick={() => setNewKind("text")} aria-label="Novo canal de texto" className="rounded p-1 text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /></button>}</div>
              {channels.isLoading && <p className="px-3 text-xs text-muted-foreground">Carregando...</p>}
              {texts.map((c) => (
                <div key={c.id} className="group mx-2 flex items-center">
                  <button type="button" onClick={() => { setTextId(c.id); setTab("conversa"); }} aria-current={textChannel?.id === c.id ? "true" : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${textChannel?.id === c.id ? "bg-secondary/80 font-semibold" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
                    <Hash className="h-4 w-4 shrink-0" /><span className="truncate">{c.name}</span>
                  </button>
                  {mod && texts.length > 1 && <button type="button" onClick={() => void dropChannel(c)} aria-label={`Apagar #${c.name}`} className="p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center pr-2"><p className={`${head} flex-1`}>Voz</p>{mod && <button type="button" onClick={() => setNewKind("voice")} aria-label="Novo canal de voz" className="rounded p-1 text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /></button>}</div>
              {!voiceOn && <p className="px-3 text-xs text-muted-foreground">A voz ainda não foi ativada no servidor.</p>}
              {voiceOn && voices.map((c) => {
                const here = voiceId === c.id;
                return (
                  <div key={c.id}>
                    <div className="group mx-2 flex items-center">
                      <button type="button" onClick={() => setVoiceId(c.id)} disabled={here && voice.joining}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${here ? "font-semibold" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
                        <Volume2 className={`h-4 w-4 shrink-0 ${here && voice.connected ? "text-emerald-400" : ""}`} /><span className="truncate">{c.name}</span>
                        {here && voice.joining && <span className="ml-auto text-[11px] font-normal">Entrando...</span>}
                      </button>
                      {mod && voices.length > 1 && <button type="button" onClick={() => void dropChannel(c)} aria-label={`Apagar ${c.name}`} className="p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                    {here && voice.connected && <ul className="mx-2 space-y-0.5 pl-3" aria-label="Quem está na sala">{voice.people.map((p) => <PersonRow key={p.id} person={p} settings={settings} onChange={change} />)}</ul>}
                  </div>
                );
              })}
            </div>
          </div>
          {voiceOn && (
            <div className="border-t border-border bg-black/25 p-2">
              <div className="flex items-center gap-2">
                <Avatar nick={myName} size={32} speaking={voice.people.some((p) => p.me && p.speaking)} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-semibold">{myName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{!voice.connected ? "Fora da voz" : settings.mode === "ptt" ? (voice.talking ? "Falando" : `Segure ${keyLabel(settings.pttKey)} para falar`) : voice.muted ? "Mudo" : "Microfone aberto"}</p>
                </div>
                <Button type="button" size="icon" variant={voice.muted ? "destructive" : "ghost"} className="h-8 w-8" disabled={!voice.connected} onClick={voice.toggleMute} aria-label={voice.muted ? "Ligar o microfone" : "Silenciar o microfone"} aria-pressed={voice.muted}>{voice.muted ? <MicOff /> : <Mic />}</Button>
                <Button type="button" size="icon" variant={voice.deafened ? "destructive" : "ghost"} className="h-8 w-8" disabled={!voice.connected} onClick={voice.toggleDeafen} aria-label={voice.deafened ? "Voltar a ouvir" : "Ensurdecer"} aria-pressed={voice.deafened}>{voice.deafened ? <HeadphoneOff /> : <Headphones />}</Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSettingsOpen(true)} aria-label="Ajustes de voz"><Settings /></Button>
              </div>
              {voice.connected && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button type="button" size="sm" variant={voice.sharing ? "secondary" : "outline"} onClick={() => void voice.toggleShare()}>{voice.sharing ? <MonitorX /> : <MonitorUp />} {voice.sharing ? "Parar" : "Tela"}</Button>
                  <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { voice.leave(); setVoiceId(null); }}><PhoneOff /> Sair</Button>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* 3. conversa */}
        <div className={`${show("conversa")} min-h-[30rem] min-w-0 flex-col md:min-h-0`}>
          {voice.screens.length > 0 && <div className="space-y-2 border-b border-border p-3">{voice.screens.map((s) => <ScreenView key={s.id} screen={s} />)}</div>}
          {textChannel ? <TextChannel key={textChannel.id} channel={textChannel} canMod={mod} userId={userId} myName={myName} /> : <p className="p-6 text-sm text-muted-foreground">{channels.isLoading ? "Carregando..." : "Esta guilda ainda não tem canal de texto."}</p>}
        </div>

        {/* 4. membros */}
        <aside className={`${show("membros")} min-h-[28rem] flex-col border-t border-border bg-background/60 md:min-h-0 md:border-l md:border-t-0`}>
          <h2 className="flex items-center gap-1.5 border-b border-border px-3 py-2.5 text-sm font-bold"><Users className="h-4 w-4" /> Membros{members.data ? ` (${members.data.length})` : ""}</h2>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {members.data?.map((m) => <MemberRow key={m.user_id} m={m} guildId={space.id} myRole={space.role} meId={userId} onChanged={() => void refreshMembers()} />)}
          </ul>
        </aside>
      </section>

      <VoiceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={change} connected={voice.connected} />
      <Dialog open={exploreOpen} onOpenChange={setExploreOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Espaços públicos</DialogTitle><DialogDescription>Qualquer pessoa logada pode entrar.</DialogDescription></DialogHeader>
          <OpenSpaceList joined={spaces.map((s) => s.id)} onJoined={(slug) => { write(GUILD_KEY, slug); setGuildSlug(slug); setExploreOpen(false); void qc.invalidateQueries({ queryKey: ["spaces", userId] }); }} />
        </DialogContent>
      </Dialog>
      {mod && <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} guildId={space.id} />}
      <NewChannelDialog kind={newKind} onClose={() => setNewKind(null)} guildId={space.id} onCreated={() => void refreshChannels()} />
    </main>
  );
}

function MemberRow({ m, guildId, myRole, meId, onChanged }: { m: SpaceMember; guildId: string; myRole: Space["role"]; meId: string; onChanged: () => void }) {
  const icon = m.role === "owner" ? <Crown className="h-3.5 w-3.5 text-gold" aria-label="Dono" /> : m.role === "mod" ? <Shield className="h-3.5 w-3.5 text-primary" aria-label="Moderador" /> : null;
  const body = (<><Avatar nick={m.name} size={26} /><span className="min-w-0 flex-1 truncate text-left text-sm">{m.name}{m.user_id === meId ? " (você)" : ""}</span>{icon}</>);
  const canAct = m.role !== "owner" && m.user_id !== meId && canModerate(myRole) && !(m.role === "mod" && myRole !== "owner");
  if (!canAct) return <li className="flex items-center gap-2 rounded-md px-2 py-1">{body}</li>;
  const run = async (fn: () => Promise<void>, ok: string) => { try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error(err(e)); } };
  return (
    <li>
      <Popover>
        <PopoverTrigger asChild><button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5" aria-label={`Opções de ${m.name}`}>{body}</button></PopoverTrigger>
        <PopoverContent className="w-56 space-y-2" align="end">
          <p className="truncate text-sm font-bold">{m.name}</p>
          {myRole === "owner" && <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => void run(() => setMemberRole(guildId, m.user_id, m.role === "mod" ? "member" : "mod"), m.role === "mod" ? "Agora é membro." : "Agora é moderador.")}><Shield /> {m.role === "mod" ? "Tirar de moderador" : "Tornar moderador"}</Button>}
          <Button type="button" size="sm" variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Banir ${m.name}? A pessoa sai e não consegue voltar.`)) void run(() => banMember(guildId, m.user_id), "Banido."); }}><Ban /> Banir</Button>
          <Button type="button" size="sm" variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Remover ${m.name} da guilda?`)) void run(() => removeMember(guildId, m.user_id), "Removido da guilda."); }}><X /> Remover da guilda</Button>
        </PopoverContent>
      </Popover>
    </li>
  );
}

function TextChannel({ channel, canMod, userId, myName }: { channel: Channel; canMod: boolean; userId: string; myName: string }) {
  const qc = useQueryClient();
  const key = ["space-messages", channel.id];
  const list = useQuery({ queryKey: key, queryFn: () => fetchSpaceMessages(channel.id), retry: false });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const messages = list.data ?? [];

  useEffect(() => {
    const ch = supabase.channel(`space-${channel.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "guild_messages", filter: `channel_id=eq.${channel.id}` }, (payload) => {
        qc.setQueryData<SpaceMessage[]>(key, (old) => mergeMessages(old ?? [], [toMessage(payload.new as never)]) as SpaceMessage[]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "guild_messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) qc.setQueryData<SpaceMessage[]>(key, (old) => (old ?? []).filter((m) => m.id !== id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.replace(/\r\n?/g, "\n").trim();
    if (!body || body.length > SPACE_MESSAGE_MAX) { toast.error(`Escreva de 1 a ${SPACE_MESSAGE_MAX} caracteres.`); return; }
    setSending(true);
    try { const sent = await sendSpaceMessage(channel.id, body); setText(""); qc.setQueryData<SpaceMessage[]>(key, (old) => mergeMessages(old ?? [], [sent]) as SpaceMessage[]); }
    catch (e2) { toast.error(err(e2)); } finally { setSending(false); }
  }
  async function remove(id: string) {
    try { await deleteSpaceMessage(id); qc.setQueryData<SpaceMessage[]>(key, (old) => (old ?? []).filter((m) => m.id !== id)); } catch (e) { toast.error(err(e)); }
  }
  async function wipe() {
    if (!window.confirm(`Apagar todas as mensagens de #${channel.name}?`)) return;
    try { await clearChannel(channel.id); qc.setQueryData<SpaceMessage[]>(key, []); toast.success("Canal limpo."); } catch (e) { toast.error(err(e)); }
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Hash className="h-4 w-4 text-muted-foreground" /><h2 className="font-bold">{channel.name}</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline">ao vivo · só membros da guilda</span>
        {canMod && messages.length > 0 && <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => void wipe()}><Eraser /> Limpar canal</Button>}
      </header>
      <div ref={ref} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3" role="log" aria-live="polite">
        {list.isLoading && <p className="px-2 text-sm text-muted-foreground">Carregando...</p>}
        {list.isError && <p role="alert" className="px-2 text-sm text-destructive">Não consegui carregar as mensagens.</p>}
        {!list.isLoading && !list.isError && messages.length === 0 && (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground"><Hash className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="font-semibold text-foreground">Bem-vindo a #{channel.name}</p><p>Este é o começo do canal.</p></div>
        )}
        {groupMessages(messages).map((g) => (
          <div key={g.first.id} className="flex gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
            <Avatar nick={g.nick} />
            <div className="min-w-0 flex-1">
              <p className="leading-tight"><b style={{ color: `hsl(${nickHue(g.nick)} 70% 72%)` }}>{g.nick}</b> <span className="ml-1 text-[11px] text-muted-foreground">{chatTime(g.first.created_at)}</span></p>
              {g.items.map((m) => (
                <div key={m.id} className="group flex items-start gap-2">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  {(canMod || (m as SpaceMessage).user_id === userId) && <button type="button" onClick={() => void remove(m.id)} aria-label="Apagar mensagem" className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="p-3 pt-0">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/60 pl-3 pr-1">
          <input className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground" placeholder={`Conversar em #${channel.name} como ${myName}`} aria-label="Mensagem" value={text} onChange={(e) => setText(e.target.value)} maxLength={SPACE_MESSAGE_MAX} />
          <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" disabled={sending || !text.trim()} aria-label="Enviar"><Send /></Button>
        </div>
      </form>
    </>
  );
}

function InviteDialog({ open, onOpenChange, guildId }: { open: boolean; onOpenChange: (o: boolean) => void; guildId: string }) {
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: ["invites", guildId], queryFn: () => fetchInvites(guildId), enabled: open });
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["invites", guildId] });
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(inviteLink(window.location.origin, code)); toast.success("Link copiado!"); } catch { toast.error("Não consegui copiar. Selecione o link e copie."); }
  }
  async function make() {
    setBusy(true);
    try { const inv = await createInvite(guildId); await refresh(); await copy(inv.code); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Convidar para a guilda</DialogTitle><DialogDescription>Quem abrir o link e entrar na conta vira membro. Cada convite vale por 7 dias e até 25 pessoas.</DialogDescription></DialogHeader>
        <Button type="button" onClick={() => void make()} disabled={busy}><UserPlus /> Criar convite e copiar link</Button>
        <ul className="space-y-2">
          {invites.data?.length === 0 && <li className="text-sm text-muted-foreground">Nenhum convite ativo.</li>}
          {invites.data?.map((i) => (
            <li key={i.code} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
              <code className="min-w-0 flex-1 truncate">{inviteLink(window.location.origin, i.code)}</code>
              <span className="shrink-0 text-xs text-muted-foreground">{i.uses}/{i.max_uses}</span>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void copy(i.code)} aria-label="Copiar link"><Copy /></Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => void revokeInvite(i.code).then(refresh).catch((e) => toast.error(err(e)))} aria-label="Cancelar convite"><X /></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function NewChannelDialog({ kind, onClose, guildId, onCreated }: { kind: "text" | "voice" | null; onClose: () => void; guildId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    setBusy(true);
    try { await createChannel(guildId, kind, name); setName(""); onCreated(); onClose(); } catch (e2) { toast.error(err(e2)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Novo canal de {kind === "voice" ? "voz" : "texto"}</DialogTitle><DialogDescription>{kind === "voice" ? "Uma sala de voz que fica sempre aberta." : "Letras minúsculas e hífens, como #loot-diario."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input autoFocus maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "voice" ? "Ex.: ZvZ" : "Ex.: avisos"} aria-label="Nome do canal" />
          <Button type="submit" className="w-full" disabled={busy || name.trim().length < 2}>Criar canal</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Espaços abertos ao público, com botão de entrar nos que a pessoa ainda não frequenta. */
function OpenSpaceList({ joined, onJoined }: { joined: string[]; onJoined: (slug: string) => void }) {
  const open = useQuery({ queryKey: ["open-spaces"], queryFn: fetchOpenSpaces, staleTime: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  async function join(id: string) {
    setBusy(id);
    try { const slug = await joinOpenSpace(id); toast.success("Você entrou!"); onJoined(slug); } catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  }
  if (open.isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!open.data?.length) return <p className="text-sm text-muted-foreground">Nenhum espaço público por enquanto.</p>;
  return (
    <ul className="space-y-2">
      {open.data.map((o) => (
        <li key={o.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ background: `hsl(${nickHue(o.name)} 45% 32%)` }}>{o.name.slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1"><b className="block truncate">{o.name}</b>{o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}</span>
          {joined.includes(o.id) ? <span className="text-xs text-muted-foreground">Você já está</span> : <Button type="button" size="sm" disabled={busy === o.id} onClick={() => void join(o.id)}>Entrar</Button>}
        </li>
      ))}
    </ul>
  );
}
