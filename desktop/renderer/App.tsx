import { useEffect, useMemo, useState } from "react";
import type { Api, Settings, State } from "../electron/shared";
import type { EventInfo } from "../src/core/uploader";

declare global { interface Window { logger: Api } }
const api = window.logger;
const fmt = (n: number) => n.toLocaleString("pt-BR");

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.state().then(setState); void api.getSettings().then(setSettings);
    return api.onState(setState);
  }, []);

  async function patch(p: Partial<Settings>) { setSettings(await api.setSettings(p)); }
  async function loadEvents() {
    setMsg(null);
    const r = await api.listEvents();
    if (r.ok) { setEvents(r.events); if (r.events.length === 0) setMsg({ ok: false, text: "Nenhum conteúdo seu por perto. Crie um conteúdo no site primeiro." }); }
    else setMsg({ ok: false, text: r.error });
  }
  useEffect(() => { if (settings?.token) void loadEvents(); }, [settings?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxDmg = useMemo(() => Math.max(1, ...(state?.snapshot.dps.map((d) => d.damage) ?? [1])), [state]);
  const byLooter = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of state?.snapshot.loot ?? []) m.set(l.looter, (m.get(l.looter) ?? 0) + l.quantity);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [state]);

  if (!state || !settings) return <div className="wrap"><p className="empty">Carregando...</p></div>;
  const { snapshot: snap, diag } = state;
  const capOk = diag.capture.running;

  return (
    <div className="wrap">
      <header>
        <img src="./logo.png" alt="" />
        <div><h1>PingoraX Logger</h1><div className="sub">Loot e dps do conteúdo · v{state.version}</div></div>
        <div className="spacer" />
        <span className={`pill ${capOk ? "ok" : "bad"}`}><span className="dot" />{capOk ? "Lendo o jogo" : "Captura parada"}</span>
        {snap.me && <span className="pill">Você: {snap.me}</span>}
      </header>

      {state.update && <div className="banner"><span>{state.update}</span>{state.update.includes("Reinicie") && <button className="gold" onClick={() => void api.installUpdate()}>Reiniciar e atualizar</button>}</div>}
      {!capOk && (
        <div className="banner">
          <span>{diag.capture.error ?? "A captura ainda não começou."}</span>
          <button onClick={() => void api.restartCapture()}>Tentar de novo</button>
        </div>
      )}

      <section className="card">
        <h2>Conexão com o PingoraX</h2>
        <div className="row">
          <div className="field"><label htmlFor="tk">Token (Meu perfil → Programa de loot e dps)</label>
            <input id="tk" type="password" autoComplete="off" placeholder="plx_..." value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} onBlur={(e) => void patch({ token: e.target.value })} /></div>
          <div className="field"><label htmlFor="ev">Conteúdo</label>
            <select id="ev" value={settings.eventId} onChange={(e) => void patch({ eventId: e.target.value })}>
              <option value="">Escolha o conteúdo...</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {new Date(e.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</option>)}
            </select></div>
          <button style={{ alignSelf: "flex-end" }} onClick={() => void loadEvents()}>Atualizar lista</button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="toggle"><input type="checkbox" checked={settings.autoSend} onChange={(e) => void patch({ autoSend: e.target.checked })} /> Enviar sozinho a cada 15 s</label>
          <label className="toggle"><input type="checkbox" checked={settings.onlyParty} onChange={(e) => void patch({ onlyParty: e.target.checked })} /> Só quem está no meu grupo</label>
          <div className="spacer" />
          <button className="gold" disabled={busy || !settings.token || !settings.eventId} onClick={async () => { setBusy(true); try { setMsg(await api.sendNow()); } finally { setBusy(false); } }}>{busy ? "Enviando..." : "Enviar agora"}</button>
          <button onClick={() => { if (window.confirm("Zerar dano e loot desta luta?")) void api.reset(); }}>Zerar</button>
          <button className="ghost" onClick={() => void api.openSite("/conteudos")}>Abrir o site</button>
        </div>
        {msg && <p className={`msg ${msg.ok ? "ok" : "bad"}`}>{msg.text}</p>}
        {!msg && state.lastSend && <p className={`msg ${state.lastSend.ok ? "ok" : "bad"}`}>{new Date(state.lastSend.at).toLocaleTimeString("pt-BR")} · {state.lastSend.text}</p>}
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Medidor de dps</h2>
          {snap.dps.length === 0 ? <p className="empty">Nada ainda. O dano aparece quando a luta começa.</p> : (
            <table><thead><tr><th>Jogador</th><th>Dano</th><th className="num">Cura</th></tr></thead><tbody>
              {snap.dps.map((d) => (
                <tr key={d.nick}><td>{d.nick}</td>
                  <td><div className="bar"><i style={{ width: `${(d.damage / maxDmg) * 100}%` }} /><span>{fmt(d.damage)}</span></div></td>
                  <td className="num">{fmt(d.healing)}</td></tr>
              ))}
            </tbody></table>
          )}
        </section>
        <section className="card">
          <h2>Loot</h2>
          <p className="empty" style={{ paddingTop: 0 }}>Prata pega: <b>{fmt(snap.silver)}</b> · Itens: <b>{snap.loot.length}</b></p>
          {snap.loot.length === 0 ? <p className="empty">Nenhum item pego ainda.</p> : (
            <>
              <table><thead><tr><th>Jogador</th><th className="num">Itens</th></tr></thead><tbody>
                {byLooter.map(([n, q]) => <tr key={n}><td>{n}</td><td className="num">{fmt(q)}</td></tr>)}
              </tbody></table>
              <details style={{ marginTop: 8 }}><summary>Ver todos os itens</summary>
                <table><tbody>{[...snap.loot].reverse().slice(0, 100).map((l) => <tr key={l.externalId}><td>{l.quantity}× {l.name}</td><td className="num">{l.looter}</td></tr>)}</tbody></table>
              </details>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <details>
          <summary>Diagnóstico (use se algo não aparecer)</summary>
          <p className="msg">Pacotes lidos: <b>{fmt(diag.packets)}</b> · Mensagens entendidas: <b>{fmt(diag.messages)}</b> · Placas abertas: <b>{diag.capture.devices}</b></p>
          <p className="msg">Pacotes Photon: <b>{fmt(diag.photon.packets)}</b> · Criptografadas: <b>{fmt(diag.photon.encrypted)}</b> · Comandos (tipo: vezes): {Object.entries(diag.photon.commands).map(([t, n]) => `${t}: ${n}`).join(" · ") || "nenhum"}</p>
          {diag.photon.errors.length > 0 && <p className="msg">Motivos de não entender: {diag.photon.errors.map((e) => `${e.reason} (${e.count})`).join(" · ")}</p>}
          <p className="msg">Eventos mais vistos (código: vezes): {diag.codes.length ? diag.codes.map((c) => `${c.code}: ${c.count}`).join(" · ") : "nenhum"}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={async () => { const f = await api.saveLog(); setMsg(f ? { ok: true, text: `Salvei na área de trabalho: ${f}` } : { ok: false, text: "Não consegui salvar." }); }}>Salvar diagnóstico na área de trabalho</button>
          </div>
        </details>
      </section>
    </div>
  );
}
