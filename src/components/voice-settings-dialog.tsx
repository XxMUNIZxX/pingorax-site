import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { isForbiddenKey, keyLabel, micLevel, type VoiceSettings } from "@/lib/voice-settings";

type Device = { id: string; label: string };
const DEFAULT = "default";
const pct = (v: number) => `${Math.round(v * 100)}%`;
const row = "space-y-1.5";
const heading = "text-xs font-bold uppercase tracking-wide text-muted-foreground";

/** Lista os microfones e fones. Os nomes só aparecem depois que o navegador liberar o microfone. */
function useDevices(open: boolean) {
  const [mics, setMics] = useState<Device[]>([]);
  const [speakers, setSpeakers] = useState<Device[]>([]);
  const [needsPermission, setNeedsPermission] = useState(false);
  const list = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const pick = (kind: MediaDeviceKind) => all.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications").map((d, i) => ({ id: d.deviceId, label: d.label || `Dispositivo ${i + 1}` }));
      setMics(pick("audioinput")); setSpeakers(pick("audiooutput"));
      setNeedsPermission(all.some((d) => d.kind === "audioinput" && !d.label));
    } catch { setMics([]); setSpeakers([]); }
  }, []);
  useEffect(() => {
    if (!open || !navigator.mediaDevices) return;
    void list();
    navigator.mediaDevices.addEventListener?.("devicechange", list);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", list);
  }, [open, list]);
  const allow = useCallback(async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* recusou */ }
    await list();
  }, [list]);
  return { mics, speakers, needsPermission, allow };
}

/** Barra de nível: mostra se o microfone escolhido está captando. */
function MicTest({ micId }: { micId: string }) {
  const [on, setOn] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!on) { setLevel(0); return; }
    let stop = false; let stream: MediaStream | null = null; let ctx: AudioContext | null = null; let raf = 0;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => { analyser.getByteTimeDomainData(data); setLevel(micLevel(data)); raf = requestAnimationFrame(tick); };
        tick();
      } catch { setError("Não consegui abrir esse microfone."); setOn(false); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); void ctx?.close(); };
  }, [on, micId]);
  return (
    <div className="flex items-center gap-3">
      <Button type="button" size="sm" variant="outline" onClick={() => { setError(""); setOn((v) => !v); }}><Mic /> {on ? "Parar teste" : "Testar microfone"}</Button>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary" role="meter" aria-label="Nível do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function VoiceSettingsDialog({ open, onOpenChange, settings, onChange, connected }: {
  open: boolean; onOpenChange: (open: boolean) => void; settings: VoiceSettings; onChange: (patch: Partial<VoiceSettings>) => void; connected: boolean;
}) {
  const { mics, speakers, needsPermission, allow } = useDevices(open);
  const [capturing, setCapturing] = useState(false);
  const canPickSpeaker = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  // Captura a próxima tecla apertada para o "aperte para falar".
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.code !== "Escape" && !isForbiddenKey(e.code)) onChangeRef.current({ pttKey: e.code });
      setCapturing(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing]);
  useEffect(() => { if (!open) setCapturing(false); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustes de voz</DialogTitle>
          <DialogDescription>Ficam salvos só neste navegador. {connected ? "Valem na hora, com você na sala." : "Valem quando você entrar na sala."}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className={row}>
            <p className={heading}>Dispositivos</p>
            {needsPermission && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-2 text-xs">
                <span className="min-w-0 flex-1">O navegador só mostra o nome dos dispositivos depois de liberar o microfone.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void allow()}>Liberar microfone</Button>
              </div>
            )}
            <label className="block text-sm" htmlFor="voice-mic">Microfone</label>
            <Select value={settings.micId || DEFAULT} onValueChange={(v) => onChange({ micId: v === DEFAULT ? "" : v })}>
              <SelectTrigger id="voice-mic"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={DEFAULT}>Padrão do sistema</SelectItem>{mics.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
            <MicTest micId={settings.micId} />
            <label className="mt-2 block text-sm" htmlFor="voice-speaker">Fone ou caixa de som</label>
            {canPickSpeaker ? (
              <Select value={settings.speakerId || DEFAULT} onValueChange={(v) => onChange({ speakerId: v === DEFAULT ? "" : v })}>
                <SelectTrigger id="voice-speaker"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={DEFAULT}>Padrão do sistema</SelectItem>{speakers.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : <p className="text-xs text-muted-foreground">Este navegador não deixa trocar a saída de som. O som sai pelo dispositivo padrão do sistema (Chrome e Edge permitem escolher).</p>}
          </div>

          <div className={row}>
            <div className="flex items-center justify-between"><p className={heading}>Volume geral</p><span className="text-sm">{pct(settings.master)}</span></div>
            <Slider aria-label="Volume geral" min={0} max={200} step={5} value={[Math.round(settings.master * 100)]} onValueChange={([v]) => onChange({ master: (v ?? 100) / 100 })} />
            <p className="text-xs text-muted-foreground">O volume de cada pessoa se ajusta clicando no nome dela na sala.</p>
          </div>

          <div className={row}>
            <p className={heading}>Modo do microfone</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={settings.mode === "open" ? "secondary" : "outline"} aria-pressed={settings.mode === "open"} onClick={() => onChange({ mode: "open" })}>Microfone aberto</Button>
              <Button type="button" variant={settings.mode === "ptt" ? "secondary" : "outline"} aria-pressed={settings.mode === "ptt"} onClick={() => onChange({ mode: "ptt" })}>Aperte para falar</Button>
            </div>
            {settings.mode === "ptt" && (
              <div className="mt-2 space-y-3 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm">Tecla</span>
                  <Button type="button" size="sm" variant={capturing ? "gold" : "outline"} onClick={() => setCapturing((c) => !c)}><Keyboard /> {capturing ? "Aperte uma tecla... (Esc cancela)" : keyLabel(settings.pttKey)}</Button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm"><span>Atraso ao soltar</span><span>{settings.pttRelease} ms</span></div>
                  <Slider aria-label="Atraso ao soltar a tecla" min={0} max={1000} step={50} value={[settings.pttRelease]} onValueChange={([v]) => onChange({ pttRelease: v ?? 200 })} />
                </div>
                <p className="text-xs text-muted-foreground">Funciona com a aba do PingoraX em foco, e não enquanto você digita no chat. Para usar com o jogo na frente, deixe o microfone aberto.</p>
              </div>
            )}
          </div>

          <div className={row}>
            <p className={heading}>Qualidade do áudio</p>
            {([["noiseSuppression", "Supressão de ruído"], ["echoCancellation", "Cancelamento de eco"], ["autoGain", "Ajuste automático do volume do microfone"]] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm">
                <span>{label}</span>
                <Switch checked={settings[key]} onCheckedChange={(v) => onChange({ [key]: v })} aria-label={label} />
              </label>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
