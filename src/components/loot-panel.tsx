import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Copy, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMyNick } from "@/components/require-login";
import { copyText } from "@/lib/share-text";
import { WEAPON_ROLES, roleInfo } from "@/lib/weapon-roles";
import { computeSplit, parseDpsPaste, parseLootPaste, parseSilver, splitSummaryText, type SplitConfig, type SplitPerson } from "@/lib/loot-split";
import {
  addLootItems, createLootSession, deleteDps, deleteLootItem, deleteLootSession, fetchLootSessions, lootTotal, saveDps, saveLootSession,
  type LootSession, type PersonOverride,
} from "@/lib/loot";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const box = "rounded-xl border border-border bg-card/60 p-4";
const label = "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground";
const keyOf = (nick: string) => nick.trim().toLowerCase();
const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Não consegui salvar.");

type Participant = { nick: string; role: string | null };

/** Loot e dps do conteúdo. O caller (quem edita) monta a sessão e escolhe como dividir; quem pingou só vê. */
export function LootPanel({ eventId, canEdit, participants }: { eventId: string; canEdit: boolean; participants: Participant[] }) {
  const me = useMyNick();
  const qc = useQueryClient();
  const key = ["loot", eventId];
  const q = useQuery({ queryKey: key, queryFn: () => fetchLootSessions(eventId), enabled: !!me.user, retry: false });
  const [activeId, setActiveId] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  useEffect(() => {
    if (!me.user || q.data === null || q.data === undefined) return;
    const channel = supabase.channel(`loot-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "loot_sessions", filter: `event_id=eq.${eventId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "loot_items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "dps_entries" }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, me.user?.id, q.data === null]);

  if (!me.user || q.data === null || q.isError || q.isPending) return null;
  const sessions = q.data ?? [];
  if (sessions.length === 0 && !canEdit) return null;
  const active = sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1] ?? null;

  async function create() {
    try { await createLootSession(eventId, `Loot ${sessions.length + 1}`); setActiveId(null); refresh(); } catch (err) { fail(err); }
  }

  return (
    <section className="mt-8 border-t border-border pt-6" aria-label="Loot e dps">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Coins className="h-5 w-5 text-primary" /> Loot e dps</h2>
        {sessions.map((s) => (
          <Button key={s.id} size="sm" variant={active?.id === s.id ? "secondary" : "outline"} onClick={() => setActiveId(s.id)}>{s.title}{s.status === "closed" ? " ✓" : ""}</Button>
        ))}
        {canEdit && <Button size="sm" variant="outline" onClick={() => void create()}><Plus /> Nova sessão</Button>}
      </div>
      {!active && <p className="mt-3 text-sm text-muted-foreground">Crie uma sessão para registrar o loot e o dps deste conteúdo e dividir entre quem veio.</p>}
      {active && <SessionView key={active.id} session={active} canEdit={canEdit} participants={participants} onChanged={refresh} />}
    </section>
  );
}

function SessionView({ session, canEdit, participants, onChanged }: { session: LootSession; canEdit: boolean; participants: Participant[]; onChanged: () => void }) {
  const [split, setSplit] = useState<SplitConfig>(session.split);
  const [people, setPeople] = useState<PersonOverride[]>(session.people);
  const [silverText, setSilverText] = useState(String(session.silver));
  const [title, setTitle] = useState(session.title);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Quando outra pessoa muda a sessão e eu não estou editando, acompanha.
  useEffect(() => {
    if (dirty) return;
    setSplit(session.split); setPeople(session.people); setSilverText(String(session.silver)); setTitle(session.title);
  }, [session, dirty]);

  const silver = parseSilver(silverText) ?? 0;
  const total = lootTotal({ silver, items: session.items });
  const overrides = useMemo(() => new Map(people.map((p) => [keyOf(p.nick), p])), [people]);
  const everyone: Participant[] = useMemo(() => {
    const list = [...participants];
    for (const p of people) if (p.extra && !list.some((x) => keyOf(x.nick) === keyOf(p.nick))) list.push({ nick: p.nick, role: null });
    return list;
  }, [participants, people]);
  const splitPeople: SplitPerson[] = everyone.map((p) => {
    const o = overrides.get(keyOf(p.nick));
    return { nick: p.nick, role: p.role, repair: o?.repair, manualPercent: o?.manualPercent ?? null, excluded: o?.excluded };
  });
  const result = useMemo(() => computeSplit(total, splitPeople, split), [total, splitPeople, split]);
  const totalOf = new Map(result.rows.map((r) => [keyOf(r.nick), r.total]));

  const change = (fn: () => void) => { fn(); setDirty(true); };
  const setPerson = (nick: string, patch: Partial<PersonOverride>, extra = false) => change(() => setPeople((list) => {
    const idx = list.findIndex((p) => keyOf(p.nick) === keyOf(nick));
    const merged: PersonOverride = { ...(idx >= 0 ? list[idx]! : { nick, ...(extra ? { extra: true } : {}) }), ...patch };
    return idx >= 0 ? list.map((p, i) => (i === idx ? merged : p)) : [...list, merged];
  }));

  async function saveAll() {
    setSaving(true);
    try { await saveLootSession(session.id, { title, silver, split, people }); setDirty(false); onChanged(); toast.success("Divisão salva."); }
    catch (err) { fail(err); } finally { setSaving(false); }
  }
  const run = async (fn: () => Promise<void>) => { try { await fn(); onChanged(); } catch (err) { fail(err); } };

  return (
    <div className="mt-4 space-y-4">
      <div className={`${box} flex flex-wrap items-center gap-3`}>
        {canEdit
          ? <Input className="max-w-xs" aria-label="Nome da sessão" value={title} maxLength={80} onChange={(e) => change(() => setTitle(e.target.value))} />
          : <h3 className="text-lg font-bold">{session.title}</h3>}
        <span className="text-sm text-muted-foreground">{session.status === "closed" ? "Sessão fechada" : "Sessão aberta"}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={async () => { const ok = await copyText(splitSummaryText(title, result)); if (ok) toast.success("Resumo copiado! Cole no Discord."); else toast.error("Não consegui copiar."); }}><Copy /> Copiar resumo</Button>
          {canEdit && <Button size="sm" variant="gold" disabled={!dirty || saving} onClick={() => void saveAll()}>{saving ? "Salvando..." : dirty ? "Salvar divisão" : "Salvo"}</Button>}
          {canEdit && <Button size="sm" variant="outline" onClick={() => void run(() => saveLootSession(session.id, { status: session.status === "open" ? "closed" : "open" }))}>{session.status === "open" ? "Fechar sessão" : "Reabrir"}</Button>}
          {canEdit && <Button size="sm" variant="ghost" aria-label="Excluir sessão" onClick={() => { if (window.confirm(`Excluir a sessão "${session.title}" com todo o loot e dps?`)) void run(() => deleteLootSession(session.id)); }}><Trash2 /></Button>}
        </div>
      </div>

      <ItemsBox session={session} canEdit={canEdit} silverText={silverText} onSilver={(v) => change(() => setSilverText(v))} total={total} run={run} />

      <div className={box}>
        <p className={label}>Como dividir {canEdit ? "(você decide)" : ""}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="split-method">Método</Label>
            <select id="split-method" disabled={!canEdit} value={split.method} onChange={(e) => change(() => setSplit({ ...split, method: e.target.value === "weighted" ? "weighted" : "equal" }))} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="equal">Igual para todos</option>
              <option value="weighted">Por função (pesos)</option>
            </select>
          </div>
          <div className="space-y-1"><Label htmlFor="split-pct">Guilda (%)</Label><Input id="split-pct" type="number" min={0} max={100} step="0.5" disabled={!canEdit} value={split.guildPercent} onChange={(e) => change(() => setSplit({ ...split, guildPercent: Number(e.target.value) || 0 }))} /></div>
          <div className="space-y-1"><Label htmlFor="split-fixed">Guilda (prata fixa)</Label><Input id="split-fixed" type="number" min={0} disabled={!canEdit} value={split.fixedCut} onChange={(e) => change(() => setSplit({ ...split, fixedCut: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} /></div>
          <label className="flex items-end gap-2 pb-3 text-sm"><input type="checkbox" disabled={!canEdit} checked={split.deductRepair} onChange={(e) => change(() => setSplit({ ...split, deductRepair: e.target.checked }))} /> Devolver reparo a quem pagou</label>
        </div>
        {split.method === "weighted" && (
          <div className="mt-3 flex flex-wrap gap-3">
            {WEAPON_ROLES.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm"><span className={`rounded-full border px-2 py-0.5 text-xs ${r.className}`}>{r.label}</span>
                <Input className="h-9 w-20" type="number" min={0} step="0.1" disabled={!canEdit} value={split.roleWeights[r.id] ?? 1} onChange={(e) => change(() => setSplit({ ...split, roleWeights: { ...split.roleWeights, [r.id]: Math.max(0, Number(e.target.value)) } }))} /></label>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-2">Entra</th><th className="pr-2">Jogador</th><th className="pr-2">Função</th><th className="pr-2">Reparo pago</th><th className="pr-2">% manual</th><th className="text-right">Recebe</th></tr></thead>
            <tbody>
              {everyone.map((p) => {
                const o = overrides.get(keyOf(p.nick));
                const role = roleInfo(p.role);
                return (
                  <tr key={keyOf(p.nick)} className={`border-t border-border/60 ${o?.excluded ? "opacity-50" : ""}`}>
                    <td className="py-1.5 pr-2"><input type="checkbox" aria-label={`${p.nick} entra na divisão`} disabled={!canEdit} checked={!o?.excluded} onChange={(e) => setPerson(p.nick, { excluded: !e.target.checked }, participants.every((x) => keyOf(x.nick) !== keyOf(p.nick)))} /></td>
                    <td className="pr-2 font-semibold">{p.nick}{o?.extra ? <span className="ml-1 text-xs font-normal text-muted-foreground">(extra)</span> : null}</td>
                    <td className="pr-2">{role ? <span className={`rounded-full border px-2 py-0.5 text-xs ${role.className}`}>{role.label}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="pr-2"><Input className="h-8 w-28" type="number" min={0} disabled={!canEdit} value={o?.repair ?? ""} placeholder="0" onChange={(e) => setPerson(p.nick, { repair: Math.max(0, Math.floor(Number(e.target.value) || 0)) }, !!o?.extra)} /></td>
                    <td className="pr-2"><Input className="h-8 w-20" type="number" min={0} max={100} disabled={!canEdit} value={o?.manualPercent ?? ""} placeholder="auto" onChange={(e) => setPerson(p.nick, { manualPercent: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) }, !!o?.extra)} /></td>
                    <td className="text-right font-bold text-amber-400">{o?.excluded ? "—" : fmt(totalOf.get(keyOf(p.nick)) ?? 0)}</td>
                  </tr>
                );
              })}
              {everyone.length === 0 && <tr><td colSpan={6} className="py-3 text-muted-foreground">Ninguém pingou ainda. Adicione jogadores extras abaixo.</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && <ExtraPerson onAdd={(nick) => { if (everyone.some((p) => keyOf(p.nick) === keyOf(nick))) { toast.error("Esse jogador já está na lista."); return; } setPerson(nick, { extra: true }, true); }} />}

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-background/60 p-3 text-sm">
          <span>Total <b className="text-amber-400">{fmt(result.gross)}</b></span>
          <span>Guilda <b>{fmt(result.guildCut)}</b></span>
          <span>Reparos <b>{fmt(result.repairPool)}</b></span>
          <span>Sobra <b>{fmt(result.leftover)}</b> <span className="text-muted-foreground">(fica com a guilda)</span></span>
        </div>
        {result.warnings.map((w) => <p key={w} role="status" className="mt-2 text-sm text-amber-400">{w}</p>)}
      </div>

      <DpsBox session={session} canEdit={canEdit} run={run} />
    </div>
  );
}

function ExtraPerson({ onAdd }: { onAdd: (nick: string) => void }) {
  const [nick, setNick] = useState("");
  return (
    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = nick.trim(); if (n.length < 2 || n.length > 32) { toast.error("Nick de 2 a 32 caracteres."); return; } onAdd(n); setNick(""); }}>
      <Input className="max-w-xs" aria-label="Jogador extra" placeholder="Jogador que não pingou, mas entra na divisão" value={nick} maxLength={32} onChange={(e) => setNick(e.target.value)} />
      <Button type="submit" variant="outline" size="sm"><Plus /> Adicionar</Button>
    </form>
  );
}

function ItemsBox({ session, canEdit, silverText, onSilver, total, run }: { session: LootSession; canEdit: boolean; silverText: string; onSilver: (v: string) => void; total: number; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [name, setName] = useState(""); const [qty, setQty] = useState("1"); const [value, setValue] = useState("");
  const [paste, setPaste] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    const q = parseSilver(qty); const v = parseSilver(value);
    if (!name.trim() || q === null || q < 1 || v === null) { toast.error("Informe o nome, a quantidade e o valor de cada."); return; }
    void run(() => addLootItems(session.id, [{ name: name.trim(), quantity: q, unit_value: v }])).then(() => { setName(""); setQty("1"); setValue(""); });
  }
  function importPaste() {
    const { items, invalid } = parseLootPaste(paste);
    if (items.length === 0) { toast.error("Não entendi nenhuma linha. Use: nome; quantidade; valor de cada."); return; }
    void run(() => addLootItems(session.id, items)).then(() => { setPaste(""); toast.success(`${items.length} itens adicionados${invalid.length ? `; ${invalid.length} linhas ignoradas` : ""}.`); });
  }

  return (
    <div className={box}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={label}>Loot</p>
        <p className="text-sm">Total <b className="text-amber-400">{fmt(total)}</b> de prata</p>
      </div>
      <ul className="mt-2 divide-y divide-border/60 text-sm">
        {session.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-1.5">
            <span className="min-w-0 flex-1 truncate">{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</span>
            <span className="shrink-0 text-muted-foreground">{fmt(item.unit_value)}{item.quantity > 1 ? ` cada` : ""}</span>
            <span className="w-24 shrink-0 text-right font-semibold">{fmt(item.quantity * item.unit_value)}</span>
            {canEdit && <button type="button" aria-label={`Remover ${item.name}`} className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void run(() => deleteLootItem(item.id))}><Trash2 className="h-4 w-4" /></button>}
          </li>
        ))}
        {session.items.length === 0 && <li className="py-2 text-muted-foreground">Nenhum item ainda.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor="loot-silver">Prata direta</Label><Input id="loot-silver" className="w-40" disabled={!canEdit} value={silverText} inputMode="numeric" onChange={(e) => onSilver(e.target.value)} /></div>
        {canEdit && (
          <form onSubmit={add} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label htmlFor="loot-name">Item</Label><Input id="loot-name" className="w-48" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Espada T8" /></div>
            <div className="space-y-1"><Label htmlFor="loot-qty">Qtd</Label><Input id="loot-qty" className="w-20" value={qty} inputMode="numeric" onChange={(e) => setQty(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="loot-value">Valor de cada</Label><Input id="loot-value" className="w-32" value={value} inputMode="numeric" placeholder="12.500 ou 1.5k" onChange={(e) => setValue(e.target.value)} /></div>
            <Button type="submit" variant="outline"><Plus /> Item</Button>
          </form>
        )}
      </div>
      {canEdit && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-primary">Colar vários itens de uma vez</summary>
          <p className="mt-2 text-xs text-muted-foreground">Uma linha por item: <code>nome; quantidade; valor de cada</code> (ou só <code>nome; valor</code>). Aceita 12.500, 1.5k e 2m.</p>
          <Textarea className="mt-2" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Espada T8; 2; 12.500\nBota T7; 800\nCapa; 3; 1.5k"} />
          <Button className="mt-2" size="sm" variant="outline" onClick={importPaste}>Importar</Button>
        </details>
      )}
    </div>
  );
}

function DpsBox({ session, canEdit, run }: { session: LootSession; canEdit: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [paste, setPaste] = useState("");
  const rows = [...session.dps].sort((a, b) => b.damage - a.damage);
  const maxDamage = Math.max(1, ...rows.map((r) => r.damage));
  const totalDamage = rows.reduce((s, r) => s + r.damage, 0);
  if (rows.length === 0 && !canEdit) return null;

  function importPaste() {
    const { rows: parsed, invalid } = parseDpsPaste(paste);
    if (parsed.length === 0) { toast.error("Não entendi nenhuma linha. Use: nick; dano; cura."); return; }
    void run(() => saveDps(session.id, parsed)).then(() => { setPaste(""); toast.success(`${parsed.length} jogadores salvos${invalid.length ? `; ${invalid.length} linhas ignoradas` : ""}.`); });
  }

  return (
    <div className={box}>
      <p className={label}>Dps</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.nick} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate font-semibold">{r.nick}</span>
            <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-secondary" role="img" aria-label={`${r.nick}: ${fmt(r.damage)} de dano`}>
              <span className="absolute inset-y-0 left-0 rounded bg-primary/70" style={{ width: `${(r.damage / maxDamage) * 100}%` }} />
            </span>
            <span className="w-28 shrink-0 text-right">{fmt(r.damage)} <span className="text-xs text-muted-foreground">{totalDamage ? `${Math.round((r.damage / totalDamage) * 100)}%` : ""}</span></span>
            <span className="hidden w-24 shrink-0 text-right text-emerald-300 sm:block">{r.healing > 0 ? `${fmt(r.healing)} cura` : ""}</span>
            {canEdit && <button type="button" aria-label={`Remover ${r.nick}`} className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void run(() => deleteDps(session.id, r.nick))}><Trash2 className="h-4 w-4" /></button>}
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted-foreground">Nenhum dps registrado.</li>}
      </ul>
      {canEdit && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-primary">Colar o dps</summary>
          <p className="mt-2 text-xs text-muted-foreground">Uma linha por jogador: <code>nick; dano; cura</code> (cura é opcional). Repetir o nick atualiza o valor.</p>
          <Textarea className="mt-2" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Ana; 1.2m; 30k\nBia; 800k"} />
          <Button className="mt-2" size="sm" variant="outline" onClick={importPaste}>Importar</Button>
        </details>
      )}
    </div>
  );
}
