import type { Snapshot } from "../src/core/tracker";
import type { EventInfo } from "../src/core/uploader";

export type Settings = { token: string; eventId: string; onlyParty: boolean; autoSend: boolean };
export type Diagnostics = { packets: number; messages: number; photon: { packets: number; decoded: number; encrypted: number; commands: Record<number, number>; errors: { reason: string; count: number }[] }; codes: { code: number; count: number }[]; capture: { running: boolean; devices: number; error?: string | undefined } };
export type State = { snapshot: Snapshot; diag: Diagnostics; lastSend: { at: number; ok: boolean; text: string } | null; update: string | null; version: string };
export type Api = {
  state(): Promise<State>;
  onState(cb: (s: State) => void): () => void;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  listEvents(): Promise<{ ok: true; events: EventInfo[] } | { ok: false; error: string }>;
  sendNow(): Promise<{ ok: boolean; text: string }>;
  reset(): Promise<void>;
  restartCapture(): Promise<void>;
  saveLog(): Promise<string>;
  openSite(path: string): Promise<void>;
  installUpdate(): Promise<void>;
};
