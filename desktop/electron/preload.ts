import { contextBridge, ipcRenderer } from "electron";
import type { Api, State } from "./shared";

const api: Api = {
  state: () => ipcRenderer.invoke("state"),
  onState: (cb) => { const h = (_e: unknown, s: State) => cb(s); ipcRenderer.on("state", h); return () => { ipcRenderer.removeListener("state", h); }; },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  listEvents: () => ipcRenderer.invoke("events:list"),
  sendNow: () => ipcRenderer.invoke("send"),
  reset: () => ipcRenderer.invoke("reset"),
  restartCapture: () => ipcRenderer.invoke("capture:restart"),
  saveLog: () => ipcRenderer.invoke("log:save"),
  openSite: (p) => ipcRenderer.invoke("open", p),
  installUpdate: () => ipcRenderer.invoke("update:install"),
};
contextBridge.exposeInMainWorld("logger", api);
