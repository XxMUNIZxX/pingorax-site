import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Volume2 } from "lucide-react";
import type { RemoteTrack, Room as LiveKitRoom } from "livekit-client";
import { Button } from "@/components/ui/button";
import { useMyNick } from "@/components/require-login";
import { getVoiceStatus, getVoiceToken } from "@/lib/voice.functions";

type Person = { id: string; name: string; speaking: boolean; muted: boolean; me: boolean };
type Screen = { id: string; name: string; track: RemoteTrack };

/** Motivo curto do erro, para quem for pedir ajuda. */
function reason(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "erro desconhecido";
  return text.replace(/\s+/g, " ").slice(0, 120);
}

/** Vídeo de uma tela compartilhada por outra pessoa. */
function ScreenView({ screen }: { screen: Screen }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    screen.track.attach(el);
    return () => { screen.track.detach(el); };
  }, [screen.track]);
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-black">
      <video ref={ref} autoPlay playsInline controls className="max-h-[70vh] w-full object-contain" />
      <figcaption className="bg-card/80 px-3 py-1 text-xs text-muted-foreground">Tela de {screen.name}</figcaption>
    </figure>
  );
}

/** Sala de voz e compartilhamento de tela do conteúdo. Só aparece quando o servidor tem o LiveKit configurado. */
export function VoiceRoom({ eventId }: { eventId: string }) {
  const me = useMyNick();
  const status = useQuery({ queryKey: ["voice-status"], queryFn: () => getVoiceStatus(), staleTime: 10 * 60_000, retry: false });
  const roomRef = useRef<LiveKitRoom | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);

  const leave = () => { void roomRef.current?.disconnect(); };
  // Sai da sala ao trocar de página.
  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

  if (!status.data?.enabled || me.status !== "ready") return null;

  async function join() {
    setJoining(true);
    try {
      let granted: Awaited<ReturnType<typeof getVoiceToken>>;
      try { granted = await getVoiceToken({ data: { eventId } }); }
      catch (err) { console.error("voz: chave de acesso", err); toast.error(`O site não conseguiu gerar a chave da sala (${reason(err)}).`); return; }
      if (!granted.ok) { toast.error(granted.error); return; }
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      const refresh = () => {
        const all = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
        setPeople(all.map((p) => ({ id: p.identity, name: p.name || p.identity, speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled, me: p === room.localParticipant })));
      };
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          audioHost.current?.appendChild(el);
        } else if (track.source === Track.Source.ScreenShare) {
          setScreens((list) => [...list.filter((s) => s.id !== participant.identity), { id: participant.identity, name: participant.name || participant.identity, track }]);
        }
        refresh();
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        track.detach().forEach((el) => el.remove());
        if (track.source === Track.Source.ScreenShare) setScreens((list) => list.filter((s) => s.id !== participant.identity));
        refresh();
      });
      room.on(RoomEvent.ParticipantConnected, refresh);
      room.on(RoomEvent.ParticipantDisconnected, refresh);
      room.on(RoomEvent.ActiveSpeakersChanged, refresh);
      room.on(RoomEvent.TrackMuted, refresh);
      room.on(RoomEvent.TrackUnmuted, refresh);
      room.on(RoomEvent.LocalTrackPublished, refresh);
      room.on(RoomEvent.LocalTrackUnpublished, refresh);
      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setConnected(false); setSharing(false); setMicOn(true); setPeople([]); setScreens([]);
        if (audioHost.current) audioHost.current.replaceChildren();
      });
      try { await room.connect(granted.url, granted.token); }
      catch (err) { console.error("voz: conexão com o LiveKit", err); toast.error(`Não consegui conectar ao servidor de voz (${reason(err)}). Confira se LIVEKIT_URL começa com wss://.`); return; }
      roomRef.current = room;
      setConnected(true);
      try { await room.localParticipant.setMicrophoneEnabled(true); setMicOn(true); }
      catch { setMicOn(false); toast.error("Não consegui usar o microfone. Libere a permissão no navegador."); }
      refresh();
    } catch (err) {
      console.error("voz: entrar", err);
      toast.error(`Não consegui entrar na sala de voz (${reason(err)}).`);
    } finally { setJoining(false); }
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    try { await room.localParticipant.setMicrophoneEnabled(next); setMicOn(next); }
    catch { toast.error("Não consegui usar o microfone."); }
  }

  async function toggleShare() {
    const room = roomRef.current;
    if (!room) return;
    const next = !sharing;
    try { await room.localParticipant.setScreenShareEnabled(next, next ? { audio: true } : undefined); setSharing(next); }
    catch { toast.error("Não consegui compartilhar a tela (o navegador pode ter bloqueado ou você cancelou)."); setSharing(false); }
  }

  return (
    <section className="mt-8 border-t border-border pt-6" aria-label="Sala de voz">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Volume2 className="h-5 w-5 text-primary" /> Voz e tela <span className="text-sm font-normal text-muted-foreground">só quem pingou entra</span></h2>
      <div ref={audioHost} className="hidden" aria-hidden="true" />
      {!connected ? (
        <div className="mt-3"><Button variant="gold" onClick={() => void join()} disabled={joining}>{joining ? "Entrando..." : "Entrar na voz"}</Button></div>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={micOn ? "outline" : "destructive"} onClick={() => void toggleMic()}>{micOn ? <Mic /> : <MicOff />} {micOn ? "Microfone ligado" : "Microfone mudo"}</Button>
            <Button variant={sharing ? "secondary" : "outline"} onClick={() => void toggleShare()}>{sharing ? <MonitorX /> : <MonitorUp />} {sharing ? "Parar de compartilhar" : "Compartilhar tela"}</Button>
            <Button variant="ghost" onClick={leave}><PhoneOff /> Sair</Button>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Quem está na sala">
            {people.map((p) => (
              <li key={p.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${p.speaking ? "border-primary bg-primary/15" : "border-border"}`}>
                {p.muted ? <MicOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Mic className="h-3.5 w-3.5 text-primary" />}
                <span>{p.name}{p.me ? " (você)" : ""}</span>
              </li>
            ))}
          </ul>
          {screens.map((s) => <ScreenView key={s.id} screen={s} />)}
        </div>
      )}
    </section>
  );
}
