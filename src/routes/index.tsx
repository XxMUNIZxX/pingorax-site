import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, CalendarDays, Hammer, Skull, Swords, Users } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import hero from "@/assets/hero.jpg";
import { fetchBattleList, fetchRecentKills } from "@/lib/albion.functions";
import { fameShort, shortNumber, timeAgo } from "@/lib/albion-types";
import { fetchEvents, formatDate } from "@/lib/events";
import { DEFAULT_SHARE_IMAGE, SHARE_ORIGIN } from "@/lib/share-image";

const TITLE = "PingoraX — Conteúdos, builds, lutas e kills de Albion Online";
const DESCRIPTION = "Inscreva-se nos conteúdos com a sua arma, monte builds, analise lutas e kills do Albion e use tudo no seu Discord.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: DEFAULT_SHARE_IMAGE },
      { property: "og:image:alt", content: "Logo PingoraX" },
      { property: "og:url", content: `${SHARE_ORIGIN}/` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: DEFAULT_SHARE_IMAGE },
    ],
    links: [{ rel: "canonical", href: `${SHARE_ORIGIN}/` }],
  }),
  component: Home,
});

/** Lutas grandes do momento (Américas), direto da API do jogo. Se a API falhar, o painel some sem atrapalhar a página. */
function LivePanel() {
  const battles = useQuery({
    queryKey: ["home-battles"], staleTime: 30_000, refetchInterval: 45_000,
    queryFn: () => fetchBattleList({ data: { server: "americas", page: 0, minPlayers: 10, query: "" } }),
  });
  const list = battles.data?.ok ? battles.data.battles.slice(0, 5) : [];
  return (
    <aside aria-label="Lutas agora" className="rounded-xl border border-border/80 bg-background/80 p-4 shadow-xl shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <span className="relative flex h-2.5 w-2.5" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" /></span>
          Lutas agora nas Américas
        </h2>
        <Link to="/lutas" search={{ servidor: "americas" }} className="text-sm text-primary hover:underline">Ver todas</Link>
      </div>
      <ul className="mt-3 divide-y divide-border/70">
        {battles.isLoading && Array.from({ length: 4 }, (_, i) => <li key={i} className="h-14 animate-pulse py-2"><div className="h-full rounded-md bg-card/60" /></li>)}
        {list.map((b) => (
          <li key={b.id}>
            <Link to="/lutas" search={{ servidor: "americas", batalha: b.id }} className="flex items-center justify-between gap-3 rounded-md py-2.5 transition-colors hover:bg-card/70 sm:px-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{b.groups.slice(0, 3).join(", ") || `Batalha ${b.id}`}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(b.startTime)} · {b.players} jogadores · {b.kills} kills</span>
              </span>
              <span className="shrink-0 text-sm font-bold text-amber-400">{fameShort(b.fame)}</span>
            </Link>
          </li>
        ))}
        {!battles.isLoading && list.length === 0 && <li className="py-4 text-sm text-muted-foreground">{battles.data && !battles.data.ok ? battles.data.error : "Nenhuma luta grande agora. Abra a lista para ver as mais recentes."}</li>}
      </ul>
    </aside>
  );
}

/** Últimas kills do servidor, em linhas curtas. */
function RecentKills() {
  const feed = useQuery({ queryKey: ["home-kills"], staleTime: 30_000, queryFn: () => fetchRecentKills({ data: { server: "americas" } }) });
  const kills = feed.data?.ok ? feed.data.kills.slice(0, 3) : [];
  if (kills.length === 0) return null;
  return (
    <ul className="mt-5 space-y-1.5 text-sm">
      {kills.map((k) => (
        <li key={k.id}>
          <Link to="/kills" search={{ servidor: "americas", kill: k.id }} className="flex items-baseline justify-between gap-3 rounded-md border border-border/70 bg-background/50 px-3 py-2 transition-colors hover:border-primary/60">
            <span className="min-w-0 truncate"><b className="text-primary">{k.killer.name}</b> matou <b>{k.victim.name}</b></span>
            <span className="shrink-0 text-xs text-amber-400">{shortNumber(k.fame)} de fama</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Próximos conteúdos com vaga. */
function NextContents() {
  const events = useQuery({ queryKey: ["events"], queryFn: fetchEvents });
  const next = (events.data ?? []).filter((e) => new Date(e.starts_at).getTime() > Date.now() - 3 * 3600_000).slice(0, 3);
  if (next.length === 0) return null;
  return (
    <ul className="mt-5 space-y-1.5">
      {next.map((e) => (
        <li key={e.id}>
          <Link to="/evento/$id" params={{ id: e.id }} className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/50 px-3 py-2 transition-colors hover:border-primary/60">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{e.title}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{formatDate(e.starts_at)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5 text-muted-foreground" />{e.signups.length}/{e.max_players}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Area = { icon: ComponentType<{ className?: string }>; title: string; text: string; points: string[]; cta: string; to: "/conteudos" | "/builds" | "/lutas" | "/kills"; extra?: "contents" | "kills"; span: string };
const AREAS: Area[] = [
  { icon: CalendarDays, title: "Conteúdos", span: "lg:col-span-7", to: "/conteudos", cta: "Ver conteúdos", extra: "contents",
    text: "Veja os conteúdos marcados pela guilda, escolha a sua arma e garanta a vaga. O caller vê quem vem e com o quê.",
    points: ["Filtre por PVP ou PVE, tipo e caller", "Escolha a arma na hora de pingar", "Compartilhe o link no Discord ou WhatsApp"] },
  { icon: Hammer, title: "Builds", span: "lg:col-span-5", to: "/builds", cta: "Ver builds",
    text: "Monte builds com equipamento completo, junte várias em grupos e use na inscrição dos conteúdos.",
    points: ["Visual igual ao do jogo", "Grupos de builds por função", "Adicione builds prontas a um grupo"] },
  { icon: Swords, title: "Lutas", span: "lg:col-span-5", to: "/lutas", cta: "Ver lutas",
    text: "Todas as batalhas do Albion nos servidores das Américas, Europa e Ásia, com análise de cada uma.",
    points: ["Placar por aliança e guilda", "Linha do tempo das mortes", "IP por função e composição dos times"] },
  { icon: Skull, title: "Kills", span: "lg:col-span-7", to: "/kills", cta: "Ver kills", extra: "kills",
    text: "Acompanhe as kills ao vivo, procure um jogador pelo nome e abra qualquer kill para ver equipamento e inventário.",
    points: ["Histórico de kills e mortes de cada jogador", "Participantes, dano e cura", "Equipamento e inventário da vítima"] },
];

function AreaLink({ to, children }: { to: Area["to"]; children: ReactNode }) {
  const className = "cta-primary w-full sm:w-auto";
  if (to === "/lutas") return <Link to="/lutas" search={{ servidor: "americas" }} className={className}>{children}</Link>;
  if (to === "/kills") return <Link to="/kills" search={{ servidor: "americas" }} className={className}>{children}</Link>;
  if (to === "/builds") return <Link to="/builds" className={className}>{children}</Link>;
  return <Link to="/conteudos" className={className}>{children}</Link>;
}

function Home() {
  return (
    <main>
      <section className="relative overflow-hidden rounded-t-2xl">
        <img src={hero} alt="" width={1600} height={704} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/80 to-transparent" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="max-w-[18ch] text-4xl font-extrabold leading-[1.05] md:text-6xl">Conteúdos, builds e lutas de Albion num só lugar.</h1>
            <p className="mt-5 max-w-[52ch] text-lg text-foreground/90">Inscreva-se nos conteúdos com a sua arma, monte builds em grupo e analise lutas e kills do Albion. Tudo conectado ao Discord da sua guilda.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/conteudos" className="cta-primary">Ver conteúdos<ArrowRight /></Link>
              <Link to="/lutas" search={{ servidor: "americas" }} className="cta-secondary">Ver lutas agora</Link>
            </div>
          </div>
          <LivePanel />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="areas-heading">
        <h2 id="areas-heading" className="text-3xl font-extrabold">O que você encontra aqui</h2>
        <p className="mt-2 max-w-[60ch] text-muted-foreground">Quatro áreas, cada uma pensada para uma parte do seu dia no Albion.</p>
        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          {AREAS.map((area) => (
            <article key={area.title} className={`panel flex min-w-0 flex-col p-6 ${area.span}`}>
              <h3 className="flex items-center gap-2.5 text-2xl font-bold"><area.icon className="h-6 w-6 text-primary" aria-hidden />{area.title}</h3>
              <p className="mt-3 max-w-[60ch] text-muted-foreground">{area.text}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {area.points.map((point) => <li key={point} className="flex gap-2"><span className="mt-2 h-1 w-3 shrink-0 rounded-full bg-primary/70" aria-hidden />{point}</li>)}
              </ul>
              {area.extra === "contents" && <NextContents />}
              {area.extra === "kills" && <RecentKills />}
              <div className="mt-auto pt-6"><AreaLink to={area.to}>{area.cta}<ArrowRight /></AreaLink></div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/70 bg-card/30" aria-labelledby="bot-heading">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 id="bot-heading" className="flex items-center gap-2.5 text-3xl font-extrabold"><Bot className="h-7 w-7 text-primary" aria-hidden />Bot do PingoraX no seu Discord</h2>
            <p className="mt-3 max-w-[58ch] text-muted-foreground">Cada conteúdo vira um cartão no canal da guilda, com as armas já escolhidas e um botão para pingar ou sair. Qualquer pessoa do servidor também consulta lutas e kills sem sair do chat.</p>
            <p className="mt-3 max-w-[58ch] text-muted-foreground">Para ligar no seu servidor, abra Criar conteúdo e siga o passo a passo do Discord. Leva poucos minutos.</p>
            <div className="mt-6"><Link to="/criar" className="cta-primary">Conectar meu servidor<ArrowRight /></Link></div>
          </div>
          <div className="rounded-xl border border-border bg-background/70 p-5 font-mono text-sm leading-7 shadow-inner">
            <p><span className="text-primary">/pingorax conectar</span> <span className="text-muted-foreground">liga o bot ao canal da guilda</span></p>
            <p><span className="text-primary">/luta</span> <span className="text-muted-foreground">número ou link da luta, com imagem-resumo</span></p>
            <p><span className="text-primary">/kill</span> <span className="text-muted-foreground">número ou link da kill, com equipamento</span></p>
            <p><span className="text-primary">/build</span> <span className="text-muted-foreground">nome da build ou do grupo, com imagem</span></p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="text-3xl font-extrabold">Como pingar num conteúdo</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[["Escolha o conteúdo", "Abra a lista e veja data, caller e vagas."], ["Pingue com a sua arma", "Selecione a arma que você vai levar e confirme."], ["Apareça no Discord", "O cartão do canal atualiza na hora com o seu nome."]].map(([title, text], i) => (
            <li key={title} className="flex gap-4 rounded-xl border border-border/70 bg-card/40 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-extrabold text-primary" aria-hidden>{i + 1}</span>
              <span><b className="block text-lg">{title}</b><span className="text-sm text-muted-foreground">{text}</span></span>
            </li>
          ))}
        </ol>
        <div className="mt-8 text-center"><Link to="/conteudos" className="cta-primary">Ver próximos conteúdos<ArrowRight /></Link></div>
      </section>
    </main>
  );
}
