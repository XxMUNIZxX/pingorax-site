import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { RemoteTrack, Room as LiveKitRoom } from "livekit-client";
import { getVoiceToken } from "@/lib/voice.functions";
import { effectiveVolume, isForbiddenKey, isTypingTarget, type VoiceSettings } from "@/lib/voice-settings";

export type Person = { id: string; name: string; speaking: boolean; muted: boolean; me: boolean };
export type ScreenShare = { id: string; name: string; track: RemoteTrack };

/** Motivo curto do erro, para quem for pedir ajuda. */
function reason(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "erro desconhecido";
  return text.replace(/\s+/g, " ").slice(0, 120);
}

const captureOf = (s: VoiceSettings) => ({
  ...(s.micId ? { deviceId: s.micId } : {}),
  echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGain,
});

/**
 * Sala de voz do conteúdo (LiveKit): entrar, microfone aberto ou aperte para falar, mudo, ensurdecer, compartilhar tela,
 * trocar microfone e fone na hora e volume de cada pessoa.
 */
export function useVoice(eventId: string, settings: VoiceSettings) {
  const roomRef = useRef<LiveKitRoom | null>(null);
  const lkRef = useRef<typeof import("livekit-client") | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [talking, setTalking] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [screens, setScreens] = useState<ScreenShare[]>([]);
  const micQueue = useRef<Promise<void>>(Promise.resolve());
  const applied = useRef({ micId: "", speakerId: "", echo: true, noise: true, gain: true });

  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

  const wantMic = connected && !muted && !deafened && (settings.mode === "open" || pttHeld);

  // Liga e desliga o microfone conforme o modo (sempre uma ação por vez, na ordem).
  useEffect(() => {
    const room = roomRef.current;
    if (!connected || !room) return;
    micQueue.current = micQueue.current.then(async () => {
      try { await room.localParticipant.setMicrophoneEnabled(wantMic, wantMic ? captureOf(settingsRef.current) : undefined); setTalking(wantMic); }
      catch { if (wantMic) { toast.error("Não consegui usar o microfone. Libere a permissão no navegador."); setMuted(true); } }
    });
  }, [wantMic, connected]);

  // Aperte para falar: segura a tecla; ao soltar espera um pouquinho para não cortar a última palavra.
  useEffect(() => {
    if (!connected || settings.mode !== "ptt") { setPttHeld(false); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const down = (e: KeyboardEvent) => {
      if (e.code !== settings.pttKey || isForbiddenKey(e.code) || isTypingTarget(e.target as HTMLElement | null)) return;
      e.preventDefault();
      if (timer) { clearTimeout(timer); timer = undefined; }
      setPttHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== settings.pttKey) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPttHeld(false), settings.pttRelease);
    };
    const blur = () => { if (timer) clearTimeout(timer); setPttHeld(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); if (timer) clearTimeout(timer); setPttHeld(false); };
  }, [connected, settings.mode, settings.pttKey, settings.pttRelease]);

  // Volume de cada pessoa (geral x dela) e ensurdecer.
  useEffect(() => {
    const room = roomRef.current; const lk = lkRef.current;
    if (!connected || !room || !lk) return;
    for (const p of room.remoteParticipants.values()) {
      const v = effectiveVolume(settings, p.name || p.identity, deafened);
      p.setVolume(v, lk.Track.Source.Microphone);
      p.setVolume(v, lk.Track.Source.ScreenShareAudio);
    }
  }, [connected, people, deafened, settings]);

  // Troca de microfone, fone e processamento de áudio com a sala aberta.
  useEffect(() => {
    const room = roomRef.current; const lk = lkRef.current;
    if (!connected || !room || !lk) return;
    const a = applied.current;
    void (async () => {
      try {
        if (a.micId !== settings.micId) { a.micId = settings.micId; await room.switchActiveDevice("audioinput", settings.micId || "default"); }
        if (a.speakerId !== settings.speakerId) { a.speakerId = settings.speakerId; await room.switchActiveDevice("audiooutput", settings.speakerId || "default"); }
        if (a.echo !== settings.echoCancellation || a.noise !== settings.noiseSuppression || a.gain !== settings.autoGain) {
          a.echo = settings.echoCancellation; a.noise = settings.noiseSuppression; a.gain = settings.autoGain;
          await room.localParticipant.getTrackPublication(lk.Track.Source.Microphone)?.audioTrack?.restartTrack(captureOf(settings));
        }
      } catch (err) { toast.error(`Não consegui trocar o dispositivo de áudio (${reason(err)}).`); }
    })();
  }, [connected, settings]);

  const join = useCallback(async () => {
    setJoining(true);
    try {
      let granted: Awaited<ReturnType<typeof getVoiceToken>>;
      try { granted = await getVoiceToken({ data: { eventId } }); }
      catch (err) { console.error("voz: chave de acesso", err); toast.error(`O site não conseguiu gerar a chave da sala (${reason(err)}).`); return; }
      if (!granted.ok) { toast.error(granted.error); return; }
      const lk = await import("livekit-client");
      lkRef.current = lk;
      const s = settingsRef.current;
      const room = new lk.Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: captureOf(s), ...(s.speakerId ? { audioOutput: { deviceId: s.speakerId } } : {}) });
      const refresh = () => {
        const all = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
        setPeople(all.map((p) => ({ id: p.identity, name: p.name || p.identity, speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled, me: p === room.localParticipant })));
      };
      room.on(lk.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === lk.Track.Kind.Audio) audioHost.current?.appendChild(track.attach());
        else if (track.source === lk.Track.Source.ScreenShare) setScreens((list) => [...list.filter((x) => x.id !== participant.identity), { id: participant.identity, name: participant.name || participant.identity, track }]);
        refresh();
      });
      room.on(lk.RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        track.detach().forEach((el) => el.remove());
        if (track.source === lk.Track.Source.ScreenShare) setScreens((list) => list.filter((x) => x.id !== participant.identity));
        refresh();
      });
      room.on(lk.RoomEvent.ParticipantConnected, refresh);
      room.on(lk.RoomEvent.ParticipantDisconnected, refresh);
      room.on(lk.RoomEvent.ActiveSpeakersChanged, refresh);
      room.on(lk.RoomEvent.TrackMuted, refresh);
      room.on(lk.RoomEvent.TrackUnmuted, refresh);
      room.on(lk.RoomEvent.LocalTrackPublished, refresh);
      room.on(lk.RoomEvent.LocalTrackUnpublished, refresh);
      room.on(lk.RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setConnected(false); setSharing(false); setTalking(false); setPeople([]); setScreens([]);
        if (audioHost.current) audioHost.current.replaceChildren();
      });
      try { await room.connect(granted.url, granted.token); }
      catch (err) { console.error("voz: conexão com o LiveKit", err); toast.error(`Não consegui conectar ao servidor de voz (${reason(err)}). Confira se LIVEKIT_URL começa com wss://.`); return; }
      roomRef.current = room;
      applied.current = { micId: s.micId, speakerId: s.speakerId, echo: s.echoCancellation, noise: s.noiseSuppression, gain: s.autoGain };
      let micFailed = false;
      try {
        await room.localParticipant.setMicrophoneEnabled(true, captureOf(s));
        if (s.mode === "ptt") await room.localParticipant.setMicrophoneEnabled(false); // já pediu a permissão; só fala quando apertar a tecla
      } catch { micFailed = true; toast.error("Não consegui usar o microfone. Libere a permissão no navegador."); }
      setMuted(micFailed); setDeafened(false);
      setConnected(true);
      refresh();
    } catch (err) {
      console.error("voz: entrar", err);
      toast.error(`Não consegui entrar na sala de voz (${reason(err)}).`);
    } finally { setJoining(false); }
  }, [eventId]);

  const leave = useCallback(() => { void roomRef.current?.disconnect(); }, []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleDeafen = useCallback(() => setDeafened((d) => !d), []);
  const toggleShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !sharing;
    try { await room.localParticipant.setScreenShareEnabled(next, next ? { audio: true } : undefined); setSharing(next); }
    catch { toast.error("Não consegui compartilhar a tela (o navegador pode ter bloqueado ou você cancelou)."); setSharing(false); }
  }, [sharing]);

  return { audioHost, joining, connected, muted, deafened, sharing, talking, pttHeld, people, screens, join, leave, toggleMute, toggleDeafen, toggleShare };
}
