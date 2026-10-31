/** Ajustes de voz de cada pessoa (microfone, fone, volumes, microfone aberto ou aperte para falar). Ficam só neste navegador. */

export type MicMode = "open" | "ptt";
export type VoiceSettings = {
  micId: string; speakerId: string; mode: MicMode; pttKey: string; pttRelease: number;
  master: number; noiseSuppression: boolean; echoCancellation: boolean; autoGain: boolean;
  volumes: Record<string, number>;
};

export const DEFAULT_VOICE: VoiceSettings = {
  micId: "", speakerId: "", mode: "open", pttKey: "KeyV", pttRelease: 200,
  master: 1, noiseSuppression: true, echoCancellation: true, autoGain: true, volumes: {},
};

const STORAGE_KEY = "pingorax.voice.v1";
export const MAX_VOLUME = 2; // 200%

const clamp = (n: unknown, min: number, max: number, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Lê o que estava guardado, aceitando campos faltando ou fora do esperado. */
export function normalizeVoice(raw: unknown): VoiceSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const volumes: Record<string, number> = {};
  if (r["volumes"] && typeof r["volumes"] === "object") {
    for (const [name, v] of Object.entries(r["volumes"] as Record<string, unknown>).slice(0, 200)) {
      if (typeof v === "number" && Number.isFinite(v)) volumes[name.slice(0, 40)] = clamp(v, 0, MAX_VOLUME, 1);
    }
  }
  const key = text(r["pttKey"], 30);
  return {
    micId: text(r["micId"], 200), speakerId: text(r["speakerId"], 200),
    mode: r["mode"] === "ptt" ? "ptt" : "open", pttKey: key || DEFAULT_VOICE.pttKey,
    pttRelease: Math.round(clamp(r["pttRelease"], 0, 1000, DEFAULT_VOICE.pttRelease)),
    master: clamp(r["master"], 0, MAX_VOLUME, 1),
    noiseSuppression: bool(r["noiseSuppression"], true), echoCancellation: bool(r["echoCancellation"], true), autoGain: bool(r["autoGain"], true),
    volumes,
  };
}

export function loadVoiceSettings(): VoiceSettings {
  try { return normalizeVoice(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")); } catch { return { ...DEFAULT_VOICE }; }
}
export function saveVoiceSettings(s: VoiceSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* navegador sem armazenamento: vale só nesta visita */ }
}

/** Nome de volume por pessoa: o nick sem diferenciar maiúsculas, para valer em qualquer conteúdo. */
export const volumeKey = (name: string) => name.trim().toLowerCase().slice(0, 40);

/** Volume final de uma pessoa: geral x dela, e zero quando você ensurdeceu. */
export function effectiveVolume(s: VoiceSettings, name: string, deafened: boolean): number {
  if (deafened) return 0;
  return clamp(s.master * (s.volumes[volumeKey(name)] ?? 1), 0, MAX_VOLUME * MAX_VOLUME, 1);
}

const KEY_NAMES: Record<string, string> = {
  Space: "Espaço", ControlLeft: "Ctrl esq.", ControlRight: "Ctrl dir.", ShiftLeft: "Shift esq.", ShiftRight: "Shift dir.", AltLeft: "Alt esq.", AltRight: "Alt dir.",
  Backquote: "`", Tab: "Tab", CapsLock: "Caps Lock", Enter: "Enter", Backspace: "Backspace", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};
/** Nome legível de uma tecla (`KeyV` vira "V", `Digit1` vira "1"). */
export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code]!;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code || "?";
}
/** Teclas que não servem para falar (Esc cancela; Windows/Meta e atalhos do navegador atrapalham). */
export const isForbiddenKey = (code: string) => code === "Escape" || code === "MetaLeft" || code === "MetaRight" || code === "ContextMenu";

/** Quem digita no chat não deve acionar o "aperte para falar". */
export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/** Cor estável do avatar de cada nick (matiz de 0 a 359). */
export function nickHue(nick: string): number {
  let h = 0;
  for (const ch of nick.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}
export const nickInitial = (nick: string) => (nick.trim().charAt(0) || "?").toUpperCase();

/** Barra de nível do microfone (0 a 1) a partir de amostras de 0 a 255 do analisador. */
export function micLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) { const v = (samples[i]! - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

export type ChatLike = { id: string; nick: string; created_at: string };
/** Agrupa mensagens seguidas da mesma pessoa (até 5 minutos entre elas), como no Discord. */
export function groupMessages<T extends ChatLike>(messages: T[], gapMs = 5 * 60_000): { nick: string; first: T; items: T[] }[] {
  const groups: { nick: string; first: T; items: T[] }[] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    const prev = last?.items[last.items.length - 1];
    if (last && prev && last.nick.toLowerCase() === m.nick.toLowerCase() && Date.parse(m.created_at) - Date.parse(prev.created_at) <= gapMs) last.items.push(m);
    else groups.push({ nick: m.nick, first: m, items: [m] });
  }
  return groups;
}

/** "14:05" se for hoje, "ontem 14:05" ou "26/10 14:05". */
export function chatTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(now)) return hm;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (day(d) === day(yesterday)) return `ontem ${hm}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
}
