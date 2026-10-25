import { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { PhotonParser } from "../src/core/photon";
import { Tracker, gameCode } from "../src/core/tracker";
import { DEFAULT_CODES, applyCodes } from "../src/core/codes";
import { listEvents, sendSnapshot } from "../src/core/uploader";
import { Capture } from "./capture";
import type { Settings, State } from "./shared";

const SITE = "https://pingorax.online";
const DEFAULTS: Settings = { token: "", eventId: "", onlyParty: true, autoSend: true };
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), "utf8")) as Partial<Settings> & { tokenEnc?: string };
    let token = typeof raw.token === "string" ? raw.token : "";
    if (raw.tokenEnc && safeStorage.isEncryptionAvailable()) { try { token = safeStorage.decryptString(Buffer.from(raw.tokenEnc, "base64")); } catch { token = ""; } }
    return { token, eventId: typeof raw.eventId === "string" ? raw.eventId : "", onlyParty: raw.onlyParty !== false, autoSend: raw.autoSend !== false };
  } catch { return { ...DEFAULTS }; }
}
function saveSettings(s: Settings) {
  const { token, ...rest } = s;
  const out: Record<string, unknown> = { ...rest };
  if (token) { if (safeStorage.isEncryptionAvailable()) out["tokenEnc"] = safeStorage.encryptString(token).toString("base64"); else out["token"] = token; }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(out));
}

let win: BrowserWindow | null = null;
let settings = { ...DEFAULTS };
const sentIds = new Set<string>();
const codeCounts = new Map<number, number>();
let packets = 0; let messages = 0;
let lastSend: State["lastSend"] = null;
let update: string | null = null;
let captureStatus: { running: boolean; devices: number; error?: string | undefined } = { running: false, devices: 0 };
let dirty = false; let sending = false;

const tracker = new Tracker(DEFAULT_CODES, () => { dirty = true; });
const parser = new PhotonParser();
const capture = new Capture((payload) => {
  packets++;
  for (const m of parser.feed(payload)) {
    messages++;
    if (m.kind === "event") { const c = gameCode(m); codeCounts.set(c, (codeCounts.get(c) ?? 0) + 1); }
    tracker.handle(m);
  }
});

function state(): State {
  const codes = [...codeCounts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 25);
  return { snapshot: tracker.snapshot(settings.onlyParty), diag: { packets, messages, photon: parser.stats.summary(), codes, capture: captureStatus }, lastSend, update, version: app.getVersion() };
}
const push = () => { if (win && !win.isDestroyed()) win.webContents.send("state", state()); };

async function send(): Promise<{ ok: boolean; text: string }> {
  if (!settings.token) return { ok: false, text: "Cole o token do PingoraX primeiro." };
  if (!settings.eventId) return { ok: false, text: "Escolha o conteúdo." };
  if (sending) return { ok: false, text: "Envio em andamento." };
  sending = true;
  try {
    const r = await sendSnapshot(settings.token, settings.eventId, tracker.snapshot(settings.onlyParty), sentIds);
    if (r.ok) { for (const id of r.sent ?? []) sentIds.add(id); lastSend = { at: Date.now(), ok: true, text: `Enviado: ${r.items} item(ns) novos, ${r.dps} jogador(es).` }; }
    else lastSend = { at: Date.now(), ok: false, text: r.error };
    push();
    return { ok: r.ok, text: lastSend.text };
  } finally { sending = false; }
}

async function loadRemoteCodes() {
  try {
    const res = await fetch(`${SITE}/logger-codes.json`, { headers: { Accept: "application/json" } });
    if (res.ok) tracker.setCodes(applyCodes(DEFAULT_CODES, await res.json()));
  } catch { /* sem internet: segue com os códigos embutidos */ }
}

function startCapture() { captureStatus = capture.start(); push(); }

function createWindow() {
  win = new BrowserWindow({
    width: 980, height: 720, minWidth: 760, minHeight: 560, backgroundColor: "#14161f", title: "PingoraX Logger", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(SITE)) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  void win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  void app.whenReady().then(() => {
    settings = loadSettings();
    ipcMain.handle("state", () => state());
    ipcMain.handle("settings:get", () => settings);
    ipcMain.handle("settings:set", (_e, patch: Partial<Settings>) => {
      const next = { ...settings };
      if (typeof patch.token === "string") next.token = patch.token.trim().slice(0, 200);
      if (typeof patch.eventId === "string") { if (patch.eventId !== settings.eventId) sentIds.clear(); next.eventId = patch.eventId.slice(0, 60); }
      if (typeof patch.onlyParty === "boolean") next.onlyParty = patch.onlyParty;
      if (typeof patch.autoSend === "boolean") next.autoSend = patch.autoSend;
      settings = next; saveSettings(settings); push(); return settings;
    });
    ipcMain.handle("events:list", () => (settings.token ? listEvents(settings.token) : { ok: false as const, error: "Cole o token primeiro." }));
    ipcMain.handle("send", () => send());
    ipcMain.handle("reset", () => { tracker.reset(); sentIds.clear(); push(); });
    ipcMain.handle("capture:restart", () => { startCapture(); });
    ipcMain.handle("open", (_e, p: string) => { if (typeof p === "string" && p.startsWith("/")) return shell.openExternal(SITE + p); return undefined; });
    ipcMain.handle("update:install", () => { autoUpdater.quitAndInstall(); });
    ipcMain.handle("log:save", async () => {
      const file = path.join(app.getPath("desktop"), "pingorax-logger-diagnostico.json");
      const data = { when: new Date().toISOString(), version: app.getVersion(), diag: state().diag, snapshot: tracker.snapshot(false) };
      try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { void dialog.showErrorBox("Não consegui salvar", String(e)); return ""; }
      return file;
    });

    createWindow();
    void loadRemoteCodes();
    startCapture();
    setInterval(() => { if (dirty) { dirty = false; push(); } }, 500);
    setInterval(() => { if (settings.autoSend && settings.token && settings.eventId && tracker.snapshot(false).dps.length + tracker.snapshot(false).loot.length > 0) void send(); }, 15000);

    if (app.isPackaged) {
      autoUpdater.on("update-available", () => { update = "Baixando atualização..."; push(); });
      autoUpdater.on("update-downloaded", (i) => { update = `Versão ${i.version} pronta. Reinicie para atualizar.`; push(); });
      autoUpdater.on("error", () => { /* sem internet ou sem versão nova: ignora */ });
      void autoUpdater.checkForUpdates().catch(() => undefined);
      setInterval(() => { void autoUpdater.checkForUpdates().catch(() => undefined); }, 4 * 60 * 60 * 1000);
    }
  });
  app.on("window-all-closed", () => { capture.stop(); app.quit(); });
}
