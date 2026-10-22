import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CalendarDays, Search, Share2, SlidersHorizontal, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchEvents, formatDate } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_CONTENT_FILTERS, filterContents } from "@/lib/content-filters";
import { useContentOptions } from "@/lib/content-options";
import { DEFAULT_SHARE_IMAGE, SHARE_ORIGIN } from "@/lib/share-image";

const HOME_SHARE_IMAGE = DEFAULT_SHARE_IMAGE;

export const Route = createFileRoute("/conteudos")({
  head: () => ({
    meta: [
      { title: "PingoraX — Conteúdos Albion Online" },
      { name: "description", content: "Veja os próximos conteúdos de Albion e pingue com sua arma." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "PingoraX — Conteúdos Albion Online" },
      { property: "og:description", content: "Veja os próximos conteúdos de Albion e pingue com sua arma." },
      { property: "og:image", content: HOME_SHARE_IMAGE },
      { property: "og:image:alt", content: "Logo PingoraX" },
      { property: "og:url", content: `${SHARE_ORIGIN}/conteudos` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "PingoraX — Conteúdos Albion Online" },
      { name: "twitter:description", content: "Veja os próximos conteúdos de Albion e pingue com sua arma." },
      { name: "twitter:image", content: HOME_SHARE_IMAGE },
    ],
    links: [{ rel: "canonical", href: `${SHARE_ORIGIN}/conteudos` }],
  }),
  component: ContentsPage,
});

function shareEvent(e: React.MouseEvent, id: string, title: string) {
  e.preventDefault();
  e.stopPropagation();
  const url = `${window.location.origin}/evento/${id}`;
  if (navigator.share) {
    navigator.share({ title, text: `Pingue no conteúdo: ${title}`, url }).catch(() => {});
    return;
  }
  navigator.clipboard.writeText(url).then(() => toast.success("Link copiado! Cole no Discord ou WhatsApp."));
}

function ContentsPage() {
  const { data: events, isLoading, isError } = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const [filters, setFilters] = useState(EMPTY_CONTENT_FILTERS);
  const { modes, types } = useContentOptions();
  const hasFilters = filters.mode !== "all" || filters.type !== "all" || !!filters.caller.trim();

  const upcoming = filterContents((events ?? []).filter((e) => new Date(e.starts_at).getTime() > Date.now() - 3 * 3600_000), filters);

  return (
    <main>
      <section className="mx-auto max-w-5xl px-4 py-8" aria-labelledby="contents-heading">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><h1 id="contents-heading" className="text-3xl font-extrabold">Próximos conteúdos</h1><p className="mt-1 text-sm text-muted-foreground">Escolha um conteúdo e pingue com a sua arma.</p></div>
          <span className="flex items-center gap-2 text-sm text-muted-foreground"><SlidersHorizontal className="h-4 w-4" /> Filtrar conteúdos</span>
        </div>
        <div className="mb-6 space-y-4 border-b border-border pb-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-2"><Label htmlFor="filter-mode">PVP ou PVE</Label><Select value={filters.mode} onValueChange={mode => setFilters(prev => ({ ...prev, mode }))}><SelectTrigger id="filter-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os modos</SelectItem>{modes.map(mode => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent></Select></div>
            <div className="min-w-0 space-y-2"><Label htmlFor="filter-caller">Caller / líder</Label><Input id="filter-caller" type="search" placeholder="Nome de quem lidera" maxLength={80} value={filters.caller} onChange={event => setFilters(prev => ({ ...prev, caller: event.target.value }))} /></div>
            <div className="min-w-0 space-y-2"><Label htmlFor="filter-type">Tipo de conteúdo</Label><Select value={filters.type} onValueChange={type => setFilters(prev => ({ ...prev, type }))}><SelectTrigger id="filter-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{types.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3"><p aria-live="polite" className="text-sm text-muted-foreground">{isLoading ? "Carregando conteúdos..." : `${upcoming.length} ${upcoming.length === 1 ? "conteúdo encontrado" : "conteúdos encontrados"}`}</p><Button variant="ghost" size="sm" disabled={!hasFilters} onClick={() => setFilters(EMPTY_CONTENT_FILTERS)}><X /> Limpar filtros</Button></div>
        </div>
        {isError && <p role="alert" className="text-destructive">Não foi possível carregar os conteúdos.</p>}
        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {!isLoading && !isError && upcoming.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            {hasFilters ? <Search className="h-8 w-8 text-primary" /> : <CalendarDays className="h-8 w-8 text-primary" />}
            <h3 className="text-xl font-semibold">{hasFilters ? "Nenhum conteúdo encontrado" : "Nenhum conteúdo agendado"}</h3>
            <p className="text-muted-foreground">{hasFilters ? "Nenhum conteúdo encontrado com esses filtros." : "Os próximos conteúdos aparecerão aqui assim que forem marcados."}</p>
            {hasFilters && <Button variant="outline" onClick={() => setFilters(EMPTY_CONTENT_FILTERS)}>Ver todos os conteúdos</Button>}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((e) => {
            const filled = e.signups.length;
            const pct = Math.min(100, (filled / e.max_players) * 100);
            return (
              <article key={e.id} className="panel group flex min-w-0 flex-col p-5 transition-colors hover:border-primary">
                <div className="flex flex-wrap items-center gap-2">
                  {e.mode && <Badge variant="outline" className="border-primary/50 text-primary">{e.mode}</Badge>}
                  {e.content_type && <Badge variant="secondary">{e.content_type}</Badge>}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-2xl font-bold"><Link to="/evento/$id" params={{ id: e.id }} className="hover:text-primary">{e.title}</Link></h3>
                    {e.caller_name && <p className="mt-1 break-words text-sm text-muted-foreground">Caller: <span className="font-semibold text-foreground">{e.caller_name}</span></p>}
                  </div>
                  <Button variant="ghost" size="icon"
                    type="button"
                    onClick={(ev) => shareEvent(ev, e.id, e.title)}
                    aria-label={`Compartilhar ${e.title}`}
                    title={`Compartilhar ${e.title}`}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary"><CalendarDays className="h-4 w-4 shrink-0" />{formatDate(e.starts_at)}</p>
                {e.description && <p className="mt-3 line-clamp-2 break-words text-sm text-muted-foreground">{e.description}</p>}
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />{filled}/{e.max_players} jogadores</span>
                  <span className="text-muted-foreground">{e.event_weapons.length} armas</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-[image:var(--gradient-gold)]" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <span className={`text-sm font-medium ${filled >= e.max_players ? "text-muted-foreground" : "text-success"}`}>{filled >= e.max_players ? "Conteúdo lotado" : `${e.max_players - filled} vagas disponíveis`}</span>
                  <Button variant={filled >= e.max_players ? "outline" : "gold"} size="sm" asChild><Link to="/evento/$id" params={{ id: e.id }}>{filled >= e.max_players ? "Ver conteúdo" : "Pingar"}<ArrowRight /></Link></Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
