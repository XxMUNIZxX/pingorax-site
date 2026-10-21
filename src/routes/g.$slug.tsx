import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchGuildBySlug, fetchGuildEvents } from "@/lib/guilds";
import { fetchGuildPeople, type GuildPerson } from "@/lib/profiles";
import { formatDate, type GameEvent } from "@/lib/events";
import { getShareImage } from "@/lib/share-image.functions";
import { DEFAULT_SHARE_IMAGE, SHARE_ORIGIN } from "@/lib/share-image";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/g/$slug")({
  loader: async ({ params }) => {
    const [guild, shareImage] = await Promise.all([fetchGuildBySlug(params.slug).catch(() => null), getShareImage()]);
    return { guild, shareImage };
  },
  head: ({ loaderData, params }) => {
    const guild = loaderData?.guild;
    const title = guild ? `${guild.name} — conteúdos no PingoraX` : "Guilda — PingoraX";
    const desc = guild ? (guild.description?.slice(0, 160) || `Próximos conteúdos de ${guild.name} no Albion Online. Escolha sua arma e garanta sua vaga.`) : "Página de guilda do PingoraX.";
    const image = loaderData?.shareImage ?? DEFAULT_SHARE_IMAGE;
    return { meta: [
      { title }, { name: "description", content: desc },
      { property: "og:type", content: "website" }, { property: "og:title", content: title }, { property: "og:description", content: desc },
      { property: "og:image", content: image }, { property: "og:url", content: `${SHARE_ORIGIN}/g/${params.slug}` },
      { name: "twitter:card", content: "summary_large_image" }, { name: "twitter:title", content: title }, { name: "twitter:description", content: desc }, { name: "twitter:image", content: image },
    ] };
  },
  component: GuildPage,
});

function EventRow({ event }: { event: GameEvent }) {
  const full = event.signups.length >= event.max_players;
  return (
    <Link to="/evento/$id" params={{ id: event.id }} className="panel block p-4 transition hover:border-primary/60">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">{formatDate(event.starts_at)}</p>
      <h3 className="mt-1 break-words text-lg font-bold">{event.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {event.mode && <Badge variant="outline" className="border-primary/50 text-primary">{event.mode}</Badge>}
        {event.content_type && <Badge variant="secondary">{event.content_type}</Badge>}
        {event.caller_name && <span className="text-gold">Caller: {event.caller_name}</span>}
        <span className="ml-auto">{event.signups.length}/{event.max_players} jogadores{full ? " · lotado" : ""}</span>
      </div>
    </Link>
  );
}

function PersonChip({ person }: { person: GuildPerson }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
      {person.avatar_url ? <img src={person.avatar_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{person.display_name.slice(0, 1).toUpperCase()}</span>}
      <span className="min-w-0">
        <span className="block break-words font-semibold">{person.display_name}</span>
        {person.albion_nick && <span className="block break-words text-xs text-muted-foreground">{person.albion_nick}</span>}
      </span>
      {person.leader && <Badge variant={person.leader === "owner" ? "default" : "outline"} className="ml-auto shrink-0">{person.leader === "owner" ? "Líder" : "Líder declarado"}</Badge>}
    </li>
  );
}

function GuildPage() {
  const { slug } = Route.useParams();
  const { guild } = Route.useLoaderData();
  const events = useQuery({ queryKey: ["guild-events", guild?.id], queryFn: () => fetchGuildEvents(guild!.id), enabled: !!guild });

  const people = useQuery({ queryKey: ["guild-people", guild?.id], queryFn: () => fetchGuildPeople(guild!.id, guild!.owner_id), enabled: !!guild });

  if (!guild) return <main className="mx-auto max-w-5xl px-4 py-10"><p>Guilda “{slug}” não encontrada. <Link to="/conteudos" className="text-primary">Ver todos os conteúdos</Link></p></main>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Guilda</p>
      <h1 className="mt-1 break-words text-3xl font-extrabold md:text-4xl">{guild.name}</h1>
      {guild.description && <p className="mt-2 whitespace-pre-line text-muted-foreground">{guild.description}</p>}

      <h2 className="mt-8 text-xl font-bold">Próximos conteúdos</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {events.isPending && <p className="text-muted-foreground">Carregando...</p>}
        {events.isError && <p role="alert" className="text-destructive">Não foi possível carregar os conteúdos.</p>}
        {events.data && events.data.upcoming.length === 0 && <p className="text-muted-foreground md:col-span-2">Nenhum conteúdo marcado por enquanto. Volte mais tarde!</p>}
        {events.data?.upcoming.map((event) => <EventRow key={event.id} event={event} />)}
      </div>

      {people.data && people.data.length > 0 && <>
        <h2 className="mt-10 text-xl font-bold">Líderes e membros <span className="text-base font-normal text-muted-foreground">({people.data.length})</span></h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">{people.data.map((person) => <PersonChip key={person.user_id} person={person} />)}</ul>
      </>}

      {events.data && events.data.recent.length > 0 && <>
        <h2 className="mt-10 text-xl font-bold text-muted-foreground">Últimos conteúdos</h2>
        <div className="mt-3 grid gap-3 opacity-80 md:grid-cols-2">{events.data.recent.map((event) => <EventRow key={event.id} event={event} />)}</div>
      </>}
    </main>
  );
}
