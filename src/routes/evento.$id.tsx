import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchEvent, formatDate } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getShareImage } from "@/lib/share-image.functions";
import { DEFAULT_SHARE_IMAGE } from "@/lib/share-image";
import { useServerFn } from "@tanstack/react-start";
import { refreshDiscordMessage } from "@/lib/discord.functions";
import { BuildGear } from "@/components/build-view";
import { roleInfo } from "@/lib/weapon-roles";
import { fetchWaitlist } from "@/lib/waitlist";
import { copyText, eventInviteText } from "@/lib/share-text";
import { SHARE_ORIGIN } from "@/lib/share-image";

export const Route = createFileRoute("/evento/$id")({
  loader: async ({ params }) => {
    const [event, shareImage] = await Promise.all([fetchEvent(params.id).catch(() => null), getShareImage()]);
    return { event, shareImage };
  },
  head: ({ loaderData }) => {
    const event = loaderData?.event;
    const title = event ? `${event.title} — Pings Albion Online` : "Pingar no conteúdo — Albion Online";
    const desc = event
      ? `${formatDate(event.starts_at)} · ${event.signups.length}/${event.max_players} players · Escolha sua arma e garanta sua vaga!`
      : "Escolha sua arma e garanta sua vaga no conteúdo.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: loaderData?.shareImage ?? DEFAULT_SHARE_IMAGE },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: loaderData?.shareImage ?? DEFAULT_SHARE_IMAGE },
      ],
    };
  },
  component: EventPage,
});

export function ShareButton({ title }: { title: string }) {
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Pingue no conteúdo: ${title}`, url });
        return;
      } catch {
        // usuário cancelou ou não suportado — cai no copiar
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado! Cole no Discord ou WhatsApp.");
  }
  return (
    <Button variant="gold" type="button" onClick={share} className="gap-2">
      <Share2 className="h-4 w-4" /> Compartilhar
    </Button>
  );
}

function Step({ n, label, done }: { n: number; label: string; done: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${
          done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </span>
  );
}

function EventPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: ev, isLoading } = useQuery({ queryKey: ["event", id], queryFn: () => fetchEvent(id) });
  const waitlistQuery = useQuery({ queryKey: ["waitlist", id], queryFn: () => fetchWaitlist(id), retry: false });
  const waitlist = waitlistQuery.data ?? null;  // null = migração 0011 ainda não rodada: sem fila
  const [nick, setNick] = useState("");
  const [weaponId, setWeaponId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const refreshDiscord = useServerFn(refreshDiscordMessage);
  const [openBuild, setOpenBuild] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabase
      .channel(`signups-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "signups", filter: `event_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["event", id] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist", filter: `event_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["waitlist", id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  if (isLoading) return <p className="mx-auto max-w-5xl px-4 py-10 text-muted-foreground">Carregando...</p>;
  if (!ev) return <p className="mx-auto max-w-5xl px-4 py-10">Conteúdo não encontrado. <Link to="/conteudos" className="text-primary">Voltar</Link></p>;

  const weapons = [...ev.event_weapons].sort((a, b) => a.position - b.position);
  const full = ev.signups.length >= ev.max_players;
  const canQueue = waitlist !== null;
  const chosen = weapons.find((w) => w.id === weaponId);
  /** Sem vaga nessa arma (ou conteúdo lotado): o botão vira "Entrar na fila". */
  const noRoom = (w: { id: string; slots: number }) => full || ev.signups.filter((s) => s.weapon_id === w.id).length >= w.slots;
  const joiningQueue = !!chosen && canQueue && noRoom(chosen);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!weaponId) { toast.error("Escolha uma arma"); return; }
    if (nick.trim().length < 2) { toast.error("Digite seu nick"); return; }
    setSending(true);
    const row = { event_id: id, weapon_id: weaponId, nick: nick.trim() };
    const { error } = joiningQueue ? await supabase.from("waitlist").insert(row) : await supabase.from("signups").insert(row);
    setSending(false);
    if (error) {
      toast.error(error.code === "23505" ? (joiningQueue ? "Esse nick já está na fila" : "Esse nick já pingou neste conteúdo") : error.message);
    } else if (joiningQueue) {
      toast.success("Você entrou na fila! Se abrir vaga, seu ping é confirmado sozinho.");
      void refreshDiscord({ data: { eventId: id } }).catch(() => undefined);
      setNick(""); setWeaponId(null);
    } else {
      toast.success("Ping confirmado! Nos vemos lá.");
      void refreshDiscord({ data: { eventId: id } }).catch(() => undefined);
      setNick(""); setWeaponId(null);
    }
    qc.invalidateQueries({ queryKey: ["event", id] });
    qc.invalidateQueries({ queryKey: ["waitlist", id] });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/conteudos" className="text-sm text-muted-foreground hover:text-primary">← Conteúdos</Link>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">{formatDate(ev.starts_at)}</p>
        {ev.mode && <Badge variant="outline" className="border-primary/50 text-primary">{ev.mode}</Badge>}
        {ev.content_type && <Badge variant="secondary">{ev.content_type}</Badge>}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="text-3xl font-extrabold md:text-4xl">{ev.title}</h1>
          {ev.caller_name && <p className="text-lg text-gold font-medium mt-1">Caller: {ev.caller_name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" type="button" onClick={async () => {
            const ok = await copyText(eventInviteText(ev, SHARE_ORIGIN, formatDate(ev.starts_at)));
            if (ok) toast.success("Convite copiado! Cole no Discord."); else toast.error("Não consegui copiar o convite.");
          }}>Copiar convite</Button>
          <ShareButton title={ev.title} />
        </div>
      </div>
      {ev.description && <p className="mt-2 whitespace-pre-line text-muted-foreground">{ev.description}</p>}
       <p className="mt-3 text-lg"><span className="font-bold text-primary">{ev.signups.length}</span> / {ev.max_players} jogadores</p>

      {full && canQueue ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-4">
          <span className="text-sm font-bold text-foreground">Lotado</span>
          <span className="text-muted-foreground">Escolha uma arma e entre na fila de espera: se alguém sair, seu ping é confirmado sozinho.</span>
        </div>
      ) : full ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-4">
          <span className="text-sm font-bold text-foreground">Como pingar</span>
          <span className="text-muted-foreground">Este conteúdo está lotado — não há mais vagas para pingar.</span>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-4">
          <span className="text-sm font-bold text-foreground">Como pingar</span>
          <Step n={1} label="Escolha sua arma" done={!!weaponId} />
          <Step n={2} label="Digite seu nick" done={nick.trim().length >= 2} />
          <Step n={3} label="Clique em Pingar" done={false} />
        </div>
      )}

      <form onSubmit={submit} className="mt-8">
        <h2 className="text-xl font-bold">Escolha sua arma</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {weapons.map((w) => {
            const taken = ev.signups.filter((s) => s.weapon_id === w.id);
            const left = w.slots - taken.length;
            const disabled = (left <= 0 || full) && !canQueue;
            const active = weaponId === w.id;
            return (
              <Button variant="outline"
                type="button" key={w.id} disabled={disabled} onClick={() => setWeaponId(w.id)}
                aria-pressed={active}
                className={`relative h-auto min-h-28 justify-start gap-3 whitespace-normal rounded-lg border p-4 pr-9 text-left transition disabled:opacity-65 ${active ? "border-primary bg-secondary ring-2 ring-primary" : "border-border bg-card hover:border-primary/60"}`}
              >
                {w.icon_url && <img src={w.icon_url} alt="" className="h-12 w-12 shrink-0 object-contain" />}
                <div className="min-w-0 break-words">
                <div className="font-display font-bold">{w.name}</div>
                {roleInfo(w.role) && <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${roleInfo(w.role)!.className}`}>{roleInfo(w.role)!.label}</span>}
                 <div className={`mt-1 text-sm ${disabled ? "text-muted-foreground" : "text-success"}`}>{full ? "Conteúdo lotado" : left > 0 ? `${left} de ${w.slots} vagas disponíveis` : "Sem vagas"}{canQueue && (full || left <= 0) ? " · fila aberta" : ""}</div>
                 {taken.length > 0 && <div className="mt-2 text-sm text-muted-foreground">Inscritos: {taken.map((t) => t.nick).join(", ")}</div>}
                </div>
                 {active && <Check className="absolute right-3 top-3 text-primary" />}
              </Button>
            );
          })}
        </div>
        {weapons.some((w) => w.build) && (
          <section className="mt-8 border-t border-border pt-6" aria-label="Builds do conteúdo">
            <h2 className="text-xl font-bold">Builds</h2>
            <p className="text-sm text-muted-foreground">Escolha uma arma para ver a build indicada.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {weapons.filter((w) => w.build).map((w) => (
                <Button key={w.id} type="button" size="sm" variant={openBuild === w.id ? "secondary" : "outline"} aria-pressed={openBuild === w.id} onClick={() => setOpenBuild(openBuild === w.id ? null : w.id)}>{w.name}</Button>
              ))}
            </div>
            {weapons.filter((w) => w.id === openBuild && w.build).map((w) => (
              <div key={w.id} className="panel mt-4 max-w-md p-4">
                <h3 className="font-bold">{w.build!.name}</h3>
                {w.build!.author_name && <p className="text-xs text-muted-foreground">por {w.build!.author_name}</p>}
                {w.build!.description && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{w.build!.description}</p>}
                <div className="mt-3"><BuildGear build={w.build!} size={64} /></div>
              </div>
            ))}
          </section>
        )}
        <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="player-nick">Seu nick no Albion</Label><Input id="player-nick" placeholder="Seu nick no jogo" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={32} /></div>
          <Button variant="gold" type="submit" disabled={sending || (full && !canQueue)} className="sm:min-w-40">{sending ? "Confirmando..." : joiningQueue ? "Entrar na fila" : full && !canQueue ? "Lotado" : "Pingar"}</Button>
        </div>
      </form>
      {waitlist && waitlist.length > 0 && (
        <section className="mt-8 border-t border-border pt-6" aria-label="Lista de espera">
          <h2 className="text-xl font-bold">Lista de espera <span className="text-base font-normal text-muted-foreground">({waitlist.length})</span></h2>
          <ol className="mt-3 space-y-1 text-sm">
            {waitlist.map((entry, i) => (
              <li key={entry.id} className="flex gap-2"><span className="w-6 shrink-0 text-muted-foreground">{i + 1}.</span><span>{entry.nick}</span><span className="text-muted-foreground">· {weapons.find((w) => w.id === entry.weapon_id)?.name ?? "arma"}</span></li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
