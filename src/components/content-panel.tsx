import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALBION_WEAPONS, fetchIsPrivate, fetchManagedEvents, fetchPrivacySupport, fetchPrivateIds, formatDate, weeklyStarts, type GameEvent } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeaponIconInput } from "@/components/weapon-icon-input";
import { WeaponCatalogPicker } from "@/components/weapon-catalog-picker";
import { uploadWeaponIcon } from "@/lib/weapon-icons";
import { EventEditorsDialog } from "@/components/event-editors-dialog";
import { useContentOptions, withCurrentValue } from "@/lib/content-options";
import { useServerFn } from "@tanstack/react-start";
import { postEventToDiscord, refreshDiscordMessage } from "@/lib/discord.functions";
import { DiscordPanel, useDiscordChannels } from "@/components/discord-panel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BuildPicker } from "@/components/build-picker";
import { catalogIconUrl, fetchWeaponCatalog, type CatalogWeapon } from "@/lib/weapon-catalog";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { fetchWaitlists } from "@/lib/waitlist";
import { copyText, eventInviteText } from "@/lib/share-text";
import { GuildPanel, useMyGuilds } from "@/components/guild-panel";
import { fetchEventGuildId } from "@/lib/guilds";
import { fetchAttendance, markAttendance, summarizeAttendance } from "@/lib/attendance";
import { SHARE_ORIGIN } from "@/lib/share-image";
import { WEAPON_ROLES, isMissingRoleColumn, moveItem, roleInfo } from "@/lib/weapon-roles";

type WeaponDraft = { uid?: string; id?: string; role?: string | null | undefined; name: string; slots: number; icon_path?: string | null | undefined; icon_url?: string | null | undefined; icon_code?: string | null | undefined; iconFile?: File | undefined; build_id?: string | null | undefined };
type Draft = { id?: string; copyOf?: string; repeat?: number; guild_id?: string | null; is_private?: boolean; title: string; description: string; starts_at: string; max_players: number; weapons: WeaponDraft[]; mode: string | null; caller_name: string | null; content_type: string | null };

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const MAX_REPEAT_WEEKS = 12;
const newUid = () => Math.random().toString(36).slice(2, 10);
const emptyDraft = (): Draft => ({ title: "", description: "", starts_at: "", max_players: 20, weapons: [{ uid: newUid(), name: "Cajado Sagrado", slots: 2 }], mode: null, caller_name: null, content_type: null });

export function ContentPanel({ userId, isAdmin, canCreate }: { userId: string; isAdmin: boolean; canCreate: boolean }) {
  const qc = useQueryClient();
  const { data: events, isPending, isError } = useQuery({ queryKey: ["managed-events", userId, isAdmin], queryFn: fetchManagedEvents });
  const [draft, setDraft] = useState<Draft | null>(null);
  const postToDiscord = useServerFn(postEventToDiscord);
  const refreshDiscord = useServerFn(refreshDiscordMessage);
  const [posting, setPosting] = useState<string | null>(null);
  const discordChannels = useDiscordChannels();
  const eventIds = (events ?? []).map((e) => e.id);
  const waitlists = useQuery({ queryKey: ["waitlists", eventIds.join(",")], queryFn: () => fetchWaitlists(eventIds), enabled: eventIds.length > 0, retry: false });
  const attendanceQuery = useQuery({ queryKey: ["attendance", eventIds.join(",")], queryFn: () => fetchAttendance(eventIds), enabled: eventIds.length > 0, retry: false });
  const attendance = attendanceQuery.data ?? null;  // null = migração 0012 ainda não rodada
  const attendanceKey = (eventId: string, nick: string) => `${eventId}|${nick.trim().toLowerCase()}`;
  const marks = new Map((attendance ?? []).map((row) => [attendanceKey(row.event_id, row.nick), row.present] as const));
  const playerStats = attendance ? summarizeAttendance(events ?? [], attendance) : [];
  async function setPresence(rows: { event_id: string; nick: string; present: boolean }[]) {
    try { await markAttendance(rows); qc.invalidateQueries({ queryKey: ["attendance"] }); }
    catch { toast.error("Não foi possível salvar a presença."); }
  }
  const privateIds = useQuery({ queryKey: ["private-ids", eventIds.join(",")], queryFn: () => fetchPrivateIds(eventIds), enabled: eventIds.length > 0 }).data;
  const posted = useQuery({ queryKey: ["discord-posts"], queryFn: async () => {
    const { data, error } = await supabase.from("discord_posts").select("event_id");
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.event_id));
  } });

  async function sendToDiscord(id: string, channelRowId?: string) {
    setPosting(id);
    try {
      const result = await postToDiscord({ data: { eventId: id, ...(channelRowId ? { channelRowId } : {}) } });
      if (result.ok) { toast.success(result.updated ? "Mensagem do Discord atualizada." : "Postado no Discord!"); void qc.invalidateQueries({ queryKey: ["discord-posts"] }); }
      else toast.error(result.error);
    } catch { toast.error("Não foi possível postar no Discord."); }
    finally { setPosting(null); }
  }

  async function removeEvent(id: string) {
    if (!confirm("Apagar este conteúdo?")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) { toast.error("Não foi possível apagar o conteúdo."); return; }
    qc.invalidateQueries({ queryKey: ["managed-events"] });
  }
  async function removeSignup(id: string, eventId: string) {
    const { error } = await supabase.from("signups").delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover o jogador."); return; }
    qc.invalidateQueries({ queryKey: ["managed-events"] });
    void refreshDiscord({ data: { eventId } }).catch(() => undefined);
  }
  async function clearSignups(e: GameEvent) {
    const queued = waitlists.data?.get(e.id)?.length ?? 0;
    if (e.signups.length === 0 && queued === 0) return;
    if (!confirm(`Limpar os ${e.signups.length} pings${queued ? ` e a fila de espera (${queued})` : ""} de "${e.title}"? As armas e vagas continuam, só os jogadores saem.`)) return;
    // A fila sai primeiro: senão cada ping removido promoveria alguém da fila para a vaga.
    if (queued) {
      const { error: queueError } = await supabase.from("waitlist").delete().eq("event_id", e.id);
      if (queueError) { toast.error("Não foi possível limpar a fila de espera."); return; }
    }
    const { error } = await supabase.from("signups").delete().eq("event_id", e.id);
    if (error) { toast.error("Não foi possível limpar os pings."); return; }
    toast.success("Pings limpos. O conteúdo está pronto para ser usado de novo.");
    qc.invalidateQueries({ queryKey: ["managed-events"] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["waitlists"] });
    void refreshDiscord({ data: { eventId: e.id } }).catch(() => undefined);
  }
  async function copyInvite(e: GameEvent) {
    const ok = await copyText(eventInviteText(e, SHARE_ORIGIN, formatDate(e.starts_at)));
    if (ok) toast.success("Convite copiado! Cole no Discord ou no WhatsApp."); else toast.error("Não consegui copiar. Tente pelo botão Compartilhar na página do conteúdo.");
  }
  async function removeQueued(id: string, eventId: string) {
    const { error } = await supabase.from("waitlist").delete().eq("id", id);
    if (error) { toast.error("Não foi possível tirar da fila."); return; }
    qc.invalidateQueries({ queryKey: ["waitlists"] });
    void refreshDiscord({ data: { eventId } }).catch(() => undefined);
  }
  /** Abre o editor com uma cópia: sem pings, sem horário (para escolher o novo) e salva como conteúdo novo. */
  function duplicate(e: GameEvent) {
    void fetchEventGuildId(e.id).then((guild_id) => setDraft((d) => (d && !d.id && d.copyOf === e.title ? { ...d, guild_id } : d)));
    void fetchIsPrivate(e.id).then((is_private) => setDraft((d) => (d && !d.id && d.copyOf === e.title ? { ...d, is_private } : d)));
    setDraft({
      copyOf: e.title, title: `${e.title} (cópia)`.slice(0, 120), description: e.description ?? "", starts_at: "", max_players: e.max_players, mode: e.mode, caller_name: e.caller_name, content_type: e.content_type,
      weapons: [...e.event_weapons].sort((a, b) => a.position - b.position).map((w) => ({ uid: newUid(), role: w.role ?? null, name: w.name, slots: w.slots, icon_path: w.icon_path, icon_url: w.icon_url, icon_code: w.icon_code, build_id: w.build_id })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function edit(e: GameEvent) {
    void fetchEventGuildId(e.id).then((guild_id) => setDraft((d) => (d?.id === e.id ? { ...d, guild_id } : d)));
    void fetchIsPrivate(e.id).then((is_private) => setDraft((d) => (d?.id === e.id ? { ...d, is_private } : d)));
    setDraft({
      id: e.id, title: e.title, description: e.description ?? "", starts_at: toLocalInput(e.starts_at), max_players: e.max_players, mode: e.mode, caller_name: e.caller_name, content_type: e.content_type,
      weapons: [...e.event_weapons].sort((a, b) => a.position - b.position).map((w) => ({ uid: newUid(), id: w.id, role: w.role ?? null, name: w.name, slots: w.slots, icon_path: w.icon_path, icon_url: w.icon_url, icon_code: w.icon_code, build_id: w.build_id })),
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-gold">Criação de conteúdo</h1>
        <div className="flex gap-2">
          {canCreate && <Button variant="gold" onClick={() => setDraft(emptyDraft())}><Plus /> Novo conteúdo</Button>}
          <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">{isAdmin ? "Todos os conteúdos" : "Meus conteúdos e compartilhados comigo"}</p>

      <DiscordPanel isAdmin={isAdmin} />
      <GuildPanel userId={userId} canCreate={canCreate} />

      {attendance && playerStats.length > 0 && (
        <details className="panel mt-6 p-4">
          <summary className="cursor-pointer font-semibold">Presença dos jogadores <span className="text-sm font-normal text-muted-foreground">({playerStats.length})</span></summary>
          <p className="mt-2 text-xs text-muted-foreground">Conta só conteúdos que já aconteceram. A taxa considera apenas o que você marcou como presente ou falta.</p>
          <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-1">Jogador</th><th>Pingou</th><th>Veio</th><th>Faltou</th><th>Taxa</th></tr></thead>
              <tbody>{playerStats.slice(0, 100).map((p) => (
                <tr key={p.nick.toLowerCase()} className="border-t border-border"><td className="py-1 pr-2">{p.nick}</td><td>{p.signed}</td><td>{p.present}</td><td>{p.absent}</td><td>{p.rate === null ? "—" : `${Math.round(p.rate * 100)}%`}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}

      {draft && <EventEditor userId={userId} draft={draft} setDraft={setDraft} onSaved={() => { setDraft(null); qc.invalidateQueries({ queryKey: ["managed-events"] }); qc.invalidateQueries({ queryKey: ["events"] }); }} />}

      <div className="mt-8 space-y-4">
        {isPending && <p className="text-muted-foreground">Carregando conteúdos...</p>}
        {isError && <p role="alert" className="text-destructive">Não foi possível carregar os conteúdos.</p>}
        {events?.length === 0 && <p className="text-muted-foreground">Nenhum conteúdo criado ainda.</p>}
        {(events ?? []).map((e) => (
          <div key={e.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-primary">{formatDate(e.starts_at)}{e.mode && ` • ${e.mode}`}{e.content_type && ` • ${e.content_type}`}</p>
                <h2 className="text-xl font-bold">{e.title}{privateIds?.has(e.id) && <span className="ml-2 align-middle rounded-full border border-primary/50 px-2 py-0.5 text-xs font-medium text-primary">Privado · só com o link</span>}</h2>
                {e.caller_name && <p className="text-sm text-gold">Caller: {e.caller_name}</p>}
                {!isAdmin && e.created_by !== userId && <span className="text-xs text-primary">Compartilhado comigo</span>}
                 <p className="text-sm text-muted-foreground">{e.signups.length}/{e.max_players} jogadores</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild><Link to="/evento/$id" params={{ id: e.id }}>Ver</Link></Button>
                <Button size="sm" variant="secondary" onClick={() => edit(e)}>Editar</Button>
                <Button size="sm" variant="outline" onClick={() => duplicate(e)}>Duplicar</Button>
                <Button size="sm" variant="outline" onClick={() => void copyInvite(e)}>Copiar convite</Button>
                <Button size="sm" variant="outline" disabled={e.signups.length === 0 && !(waitlists.data?.get(e.id)?.length)} onClick={() => void clearSignups(e)}>Limpar pings</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={posting === e.id}>{posting === e.id ? "Enviando..." : posted.data?.has(e.id) ? "Atualizar no Discord" : "Postar no Discord"}</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Escolha o canal</DropdownMenuLabel>
                    {(discordChannels.data ?? []).map((channel) => <DropdownMenuItem key={channel.id} onSelect={() => void sendToDiscord(e.id, channel.id)}>{channel.label ?? channel.channel_id}</DropdownMenuItem>)}
                    {isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void sendToDiscord(e.id)}>Canal padrão do site</DropdownMenuItem></>}
                    {(discordChannels.data?.length ?? 0) === 0 && !isAdmin && <DropdownMenuItem disabled>Conecte um canal em "Discord do meu servidor"</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                {(isAdmin || (canCreate && e.created_by === userId)) && <><EventEditorsDialog eventId={e.id} title={e.title} /><Button size="sm" variant="destructive" onClick={() => removeEvent(e.id)}>Apagar</Button></>}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {e.event_weapons.map((w) => {
                const list = e.signups.filter((s) => s.weapon_id === w.id);
                return (
                  <div key={w.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center gap-2 font-semibold">{w.icon_url && <img src={w.icon_url} alt="" className="h-10 w-10 shrink-0 object-contain" />}<span className="min-w-0 break-words">{w.name} <span className="text-muted-foreground">({list.length}/{w.slots})</span></span></div>
                    {roleInfo(w.role) && <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${roleInfo(w.role)!.className}`}>{roleInfo(w.role)!.label}</span>}
                    {list.map((s) => {
                      const mark = marks.get(attendanceKey(e.id, s.nick));
                      return (
                        <div key={s.id} className="mt-1 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            {attendance && new Date(e.starts_at).getTime() <= Date.now() && (
                              <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={mark === true} aria-label={`${s.nick} compareceu`} title={mark === false ? "Marcado como falta" : "Marcar presença"}
                                onChange={() => void setPresence([{ event_id: e.id, nick: s.nick, present: mark !== true }])} />
                            )}
                            <span className={`break-words ${mark === false ? "text-muted-foreground line-through" : ""}`}>{s.nick}</span>
                          </span>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeSignup(s.id, e.id)}>remover</Button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {attendance && e.signups.length > 0 && new Date(e.starts_at).getTime() <= Date.now() && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Conteúdo já realizado:</span>
                <Button size="sm" variant="outline" onClick={() => void setPresence(e.signups.map((s) => ({ event_id: e.id, nick: s.nick, present: true })))}>Marcar todos presentes</Button>
              </div>
            )}
            {(waitlists.data?.get(e.id)?.length ?? 0) > 0 && (
              <div className="mt-4 rounded-md border border-dashed border-border p-3 text-sm">
                <p className="font-semibold">Fila de espera ({waitlists.data!.get(e.id)!.length})</p>
                {waitlists.data!.get(e.id)!.map((q, i) => (
                  <div key={q.id} className="mt-1 flex items-center justify-between">
                    <span>{i + 1}. {q.nick} <span className="text-muted-foreground">· {e.event_weapons.find((w) => w.id === q.weapon_id)?.name ?? "arma"}</span></span>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void removeQueued(q.id, e.id)}>tirar da fila</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

function EventEditor({ userId, draft, setDraft, onSaved }: { userId: string; draft: Draft; setDraft: (d: Draft | null) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const refreshDiscord = useServerFn(refreshDiscordMessage);
  const options = useContentOptions();
  const privacySupported = useQuery({ queryKey: ["privacy-support"], queryFn: fetchPrivacySupport, staleTime: 5 * 60_000 }).data === true;
  const myGuilds = useMyGuilds(userId).data ?? null;  // null = migração 0013 não rodada
  const catalog = useQuery({ queryKey: ["weapon-catalog"], queryFn: fetchWeaponCatalog, staleTime: 60_000 });
  const modeList = withCurrentValue(options.modes, draft.mode);
  const typeList = withCurrentValue(options.types, draft.content_type);
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setW = (i: number, p: Partial<WeaponDraft>) => set({ weapons: draft.weapons.map((w, j) => (j === i ? { ...w, ...p } : w)) });
  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const byName = new Map((catalog.data ?? []).map((c) => [norm(c.name), c] as const));
  const hasOwnIcon = (w: WeaponDraft) => !!(w.iconFile || w.icon_path);
  /** Nome igual ao de uma arma do catálogo => usa a imagem dela automaticamente. */
  const setName = (i: number, name: string) => {
    const w = draft.weapons[i]; if (!w) return;
    const match = byName.get(norm(name));
    setW(i, hasOwnIcon(w) ? { name } : { name, icon_code: match?.item_code ?? null, icon_url: null });
  };
  const pickCatalog = (i: number, weapon: CatalogWeapon) => setW(i, { name: weapon.name, icon_code: weapon.item_code, iconFile: undefined, icon_path: null, icon_url: null });
  const previewUrl = (w: WeaponDraft) => w.icon_url ?? (w.icon_code ? catalogIconUrl(w.icon_code) : null);
  const totalSlots = draft.weapons.reduce((s, w) => s + (w.slots || 0), 0);

  async function save() {
    if (!draft.title || !draft.starts_at || draft.weapons.length === 0) { toast.error("Preencha título, horário e ao menos uma arma"); return; }
    setSaving(true);
    try {
    const payload = { title: draft.title, description: draft.description || null, starts_at: new Date(draft.starts_at).toISOString(), max_players: draft.max_players, mode: draft.mode || null, caller_name: draft.caller_name?.trim() || null, content_type: draft.content_type || null, ...(myGuilds && draft.guild_id !== undefined ? { guild_id: draft.guild_id } : {}), ...(privacySupported && draft.is_private !== undefined ? { is_private: draft.is_private } : {}) };
    let eventId = draft.id;
    if (eventId) {
      const { data, error } = await supabase.from("events").update(payload).eq("id", eventId).select("id").maybeSingle();
      if (error || !data) { toast.error(error?.message ?? "Você não tem mais permissão para editar este conteúdo."); return; }
    } else {
      const { data, error } = await supabase.from("events").insert(payload).select("id").single();
      if (error || !data) { setSaving(false); toast.error(error?.message ?? "Erro"); return; }
      eventId = data.id;
    }
    if (!eventId) throw new Error("Não foi possível salvar o conteúdo.");
    const { data: existing, error: existingError } = await supabase.from("event_weapons").select("id").eq("event_id", eventId);
    if (existingError) throw existingError;
    const keep = new Set(draft.weapons.filter((w) => w.id).map((w) => w.id));
    const toDelete = (existing ?? []).filter((w) => !keep.has(w.id)).map((w) => w.id);
    if (toDelete.length) {
      const { error } = await supabase.from("event_weapons").delete().in("id", toDelete);
      if (error) throw error;
    }
    let roleSkipped = false;
    const iconPaths: (string | null)[] = [];
    for (const [i, w] of draft.weapons.entries()) {
      const iconPath = w.iconFile ? await uploadWeaponIcon(w.iconFile) : w.icon_path ?? null;
      iconPaths[i] = iconPath;
      const row = { event_id: eventId, name: w.name, slots: Math.max(1, w.slots), position: i, icon_path: iconPath, icon_code: iconPath ? null : w.icon_code ?? null, build_id: w.build_id ?? null };
      const send = (r: typeof row & { role?: string | null }) => (w.id ? supabase.from("event_weapons").update(r).eq("id", w.id) : supabase.from("event_weapons").insert(r));
      let { error } = await send({ ...row, role: w.role ?? null });
      if (error && isMissingRoleColumn(error)) {
        // Migração 0009 ainda não rodada: salva sem a função, para não perder o resto das alterações.
        if (w.role) roleSkipped = true;
        ({ error } = await send(row));
      }
      if (error) throw error;
    }
    // Repetição semanal (só em conteúdo novo): cria as próximas semanas já com as mesmas armas.
    const extra = !draft.id ? Math.min(Math.max(0, Math.floor(draft.repeat ?? 0)), MAX_REPEAT_WEEKS) : 0;
    let created = 0;
    for (const [index, startsAt] of weeklyStarts(payload.starts_at, extra).entries()) {
      const k = index + 1;
      const { data: copy, error: copyError } = await supabase.from("events").insert({ ...payload, starts_at: startsAt }).select("id").single();
      if (copyError || !copy) { toast.error(`Criei ${created + 1} de ${extra + 1} conteúdos: a repetição parou na semana ${k + 1}.`); break; }
      const rows = draft.weapons.map((w, i) => ({ event_id: copy.id, name: w.name, slots: Math.max(1, w.slots), position: i, icon_path: iconPaths[i] ?? null, icon_code: iconPaths[i] ? null : w.icon_code ?? null, build_id: w.build_id ?? null }));
      let { error: rowsError } = await supabase.from("event_weapons").insert(rows.map((r, i) => ({ ...r, role: draft.weapons[i]?.role ?? null })));
      if (rowsError && isMissingRoleColumn(rowsError)) ({ error: rowsError } = await supabase.from("event_weapons").insert(rows));
      if (rowsError) { toast.error("Uma das semanas foi criada sem armas. Confira a lista."); break; }
      created++;
    }
    void qc.invalidateQueries({ queryKey: ["private-ids"] });
    toast.success(extra > 0 ? `${created + 1} conteúdos salvos (um por semana)` : "Conteúdo salvo");
    if (roleSkipped) toast.warning("As funções não foram salvas: falta rodar a migração 0009 no Supabase.");
    void refreshDiscord({ data: { eventId } }).catch(() => undefined);
    onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as armas. Tente novamente.");
    } finally { setSaving(false); }
  }

  return (
    <fieldset disabled={saving} className="mt-6 min-w-0 space-y-6 border-y border-border py-6">
      <h2 className="text-xl font-bold">{draft.id ? "Editar conteúdo" : draft.copyOf ? "Duplicar conteúdo" : "Novo conteúdo"}</h2>
      {draft.copyOf && <p className="-mt-4 text-sm text-muted-foreground">Cópia de “{draft.copyOf}”: sem jogadores. Escolha o novo horário e ajuste o que precisar antes de salvar.</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-3"><Label htmlFor="content-title">Título do conteúdo</Label><Input id="content-title" placeholder="Ex: ZvZ Black Zone, Avalon, Gank..." value={draft.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="content-start">Data e horário</Label><Input id="content-start" type="datetime-local" value={draft.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="content-capacity">Limite de jogadores</Label><Input id="content-capacity" type="number" min={1} value={draft.max_players} onChange={(e) => set({ max_players: Number(e.target.value) })} /></div>
        <div className="space-y-1">
          <Label htmlFor="content-mode">PVP ou PVE</Label>
          <Select value={draft.mode || "none"} onValueChange={(v) => set({ mode: v === "none" ? null : v })}>
            <SelectTrigger id="content-mode"><SelectValue placeholder="Selecione o modo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {modeList.map(mode => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="content-type">Tipo de conteúdo</Label>
          <Select value={draft.content_type || "none"} onValueChange={(v) => set({ content_type: v === "none" ? null : v })}>
            <SelectTrigger id="content-type"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {typeList.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="content-caller">Caller / líder</Label>
          <Input id="content-caller" maxLength={80} placeholder="Nome do Caller" value={draft.caller_name || ""} onChange={(e) => set({ caller_name: e.target.value })} />
        </div>
        {myGuilds && (myGuilds.length > 0 || draft.guild_id) && (
          <div className="space-y-1">
            <Label htmlFor="content-guild">Guilda</Label>
            <Select value={draft.guild_id ?? "none"} onValueChange={(v) => set({ guild_id: v === "none" ? null : v })}>
              <SelectTrigger id="content-guild"><SelectValue placeholder="Sem guilda" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem guilda</SelectItem>
                {myGuilds.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                {draft.guild_id && !myGuilds.some((g) => g.id === draft.guild_id) && <SelectItem value={draft.guild_id}>Outra guilda (atual)</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Aparece na página pública da guilda.</p>
          </div>
        )}
        {privacySupported && (
          <label className="flex items-start gap-3 rounded-md border border-border p-3 md:col-span-2">
            <Switch checked={draft.is_private === true} onCheckedChange={(v) => set({ is_private: v })} aria-label="Conteúdo privado" />
            <span className="text-sm"><span className="font-semibold">Conteúdo privado (só com o link)</span><br /><span className="text-muted-foreground">Não aparece na página inicial, na lista de conteúdos nem na página da guilda. Quem recebeu o link ou viu o card no Discord abre e pinga normalmente. Quem tiver o link pode repassar. O banco esconde o conteúdo privado de quem não tem o link.</span></span>
          </label>
        )}
        {!draft.id && (
          <div className="space-y-1">
            <Label htmlFor="content-repeat">Repetir</Label>
            <Select value={String(draft.repeat ?? 0)} onValueChange={(v) => set({ repeat: Number(v) })}>
              <SelectTrigger id="content-repeat"><SelectValue placeholder="Não repetir" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Não repetir</SelectItem>
                {[1, 2, 3, 4, 7, 11].map((n) => <SelectItem key={n} value={String(n)}>Toda semana, +{n} {n === 1 ? "semana" : "semanas"}</SelectItem>)}
              </SelectContent>
            </Select>
            {(draft.repeat ?? 0) > 0 && <p className="text-xs text-muted-foreground">Cria {(draft.repeat ?? 0) + 1} conteúdos no mesmo dia da semana e horário, cada um com as mesmas armas.</p>}
          </div>
        )}
        <div className="space-y-2 md:col-span-3"><Label htmlFor="content-description">Descrição (opcional)</Label><Textarea id="content-description" placeholder="Requisitos, IP mínimo, ponto de encontro..." value={draft.description} onChange={(e) => set({ description: e.target.value })} /></div>
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Armas e vagas</h3>
          <Link to="/builds" className="text-sm text-primary hover:underline">Criar uma build</Link>
          <span className={`text-sm ${totalSlots < draft.max_players ? "text-destructive" : "text-muted-foreground"}`}>{totalSlots} vagas nas armas / {draft.max_players} jogadores</span>
        </div>
        <datalist id="weapons">{[...new Set([...(catalog.data ?? []).map((c) => c.name), ...ALBION_WEAPONS])].map((w) => <option key={w} value={w} />)}</datalist>
        <div className="mt-2 space-y-2">
          {draft.weapons.map((w, i) => (
             <div key={w.uid ?? w.id ?? i} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
              <div className="flex shrink-0 flex-col">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-8" disabled={i === 0} aria-label={`Subir arma ${i + 1}`} title="Subir" onClick={() => set({ weapons: moveItem(draft.weapons, i, -1) })}><ChevronUp className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-8" disabled={i === draft.weapons.length - 1} aria-label={`Descer arma ${i + 1}`} title="Descer" onClick={() => set({ weapons: moveItem(draft.weapons, i, 1) })}><ChevronDown className="size-4" /></Button>
              </div>
              <WeaponCatalogPicker onPick={(weapon) => pickCatalog(i, weapon)} />
              <WeaponIconInput name={w.name} file={w.iconFile} url={previewUrl(w)} onChange={(file) => setW(i, { iconFile: file, icon_path: file ? w.icon_path : null, icon_url: file ? w.icon_url : null, icon_code: null })} />
              <Input list="weapons" className="min-w-0 flex-1 basis-40" aria-label={`Nome da arma ${i + 1}`} placeholder="Nome da arma" value={w.name} onChange={(e) => setName(i, e.target.value)} />
              <Input type="number" min={1} className="w-20 shrink-0" aria-label={`Vagas de ${w.name || "arma"}`} value={w.slots} onChange={(e) => setW(i, { slots: Number(e.target.value) })} />
              <Select value={w.role ?? "none"} onValueChange={(v) => setW(i, { role: v === "none" ? null : v })}>
                <SelectTrigger className="w-36 shrink-0" aria-label={`Função de ${w.name || "arma"}`}><SelectValue placeholder="Função" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem função</SelectItem>
                  {WEAPON_ROLES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <BuildPicker value={w.build_id} weaponName={w.name} weaponCode={w.icon_code} onChange={(id) => setW(i, { build_id: id })} />
               <Button variant="ghost" size="icon" aria-label={`Remover arma ${i + 1}`} title={`Remover arma ${i + 1}`} onClick={() => set({ weapons: draft.weapons.filter((_, j) => j !== i) })}><X /></Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => set({ weapons: [...draft.weapons, { uid: newUid(), name: "", slots: 1 }] })}><Plus /> Adicionar arma</Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
        <Button variant="gold" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </div>
    </fieldset>
  );
}
