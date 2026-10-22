import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WORLD_MAP_ENABLED } from "@/lib/feature-flags";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { PanelSessionProvider, usePanelAccess } from "@/components/panel-access";
import { Button } from "@/components/ui/button";
import { StartAlert } from "@/components/start-alert";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado do nosso lado. Tente atualizar a página ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pings — Conteúdos Albion Online" },
      { name: "description", content: "Inscreva-se nos conteúdos de Albion Online e escolha sua arma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <PanelSessionProvider>
      <a href="#conteudo" className="sr-only z-50 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Pular para o conteúdo</a>
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-display text-2xl font-extrabold text-gold" aria-label="PingoraX — página inicial">
            <img src="/logo-96.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
            PingoraX
          </Link>
          <PanelNavigation />
          <AccountButton />
        </div>
      </header>
      <StartAlert />
      {/* Bloco de conteúdo: dá contraste entre a página e o fundo */}
      <div id="conteudo" tabIndex={-1} className="mx-2 my-4 max-w-[76rem] rounded-2xl border border-border/70 bg-background/70 shadow-2xl shadow-black/30 backdrop-blur-sm sm:mx-4 xl:mx-auto">
      <Outlet />
      </div>
      <SiteFooter />
      <Toaster richColors theme="dark" />
      </PanelSessionProvider>
    </QueryClientProvider>
  );
}

function PanelNavigation() {
  const { isAdmin, session } = usePanelAccess();
  const active = { className: "bg-secondary text-foreground", "aria-current": "page" as const };
  return <nav aria-label="Painéis" className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 md:order-none md:w-auto md:flex-1 md:flex-wrap md:justify-center md:overflow-visible">
    <Button variant="ghost" size="sm" asChild><Link to="/conteudos" activeProps={active}>Conteúdos</Link></Button>
    <Button variant="ghost" size="sm" asChild><Link to="/builds" activeProps={active}>Builds</Link></Button>
    <Button variant="ghost" size="sm" asChild><Link to="/lutas" activeProps={active}>Lutas</Link></Button>
    <Button variant="ghost" size="sm" asChild><Link to="/kills" activeProps={active}>Kills</Link></Button>
    {WORLD_MAP_ENABLED && <Button variant="ghost" size="sm" asChild><Link to="/mapa" activeProps={active}>Mapa</Link></Button>}
    <Button variant="ghost" size="sm" asChild><Link to="/criar" activeProps={active}>Criar conteúdo</Link></Button>
    {isAdmin && <Button variant="ghost" size="sm" asChild><Link to="/admin" activeProps={active}>Administração</Link></Button>}
  </nav>;
}

/** Entrar (destaque) ou Meu perfil, sempre no canto direito do cabeçalho. */
function AccountButton() {
  const { session } = usePanelAccess();
  return (
    <Button variant={session ? "outline" : "gold"} size="sm" className="ml-auto md:ml-0" asChild>
      <Link to="/perfil">{session ? "Meu perfil" : "Entrar"}</Link>
    </Button>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-10 pt-2 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/60 pt-5">
        <p>PingoraX é um site de fãs de Albion Online, sem ligação com a Sandbox Interactive. Dados de lutas e kills vêm da API pública do jogo.</p>
        <nav aria-label="Rodapé" className="flex gap-4">
          <Link to="/" className="hover:text-foreground">Início</Link>
          <Link to="/conteudos" className="hover:text-foreground">Conteúdos</Link>
          <Link to="/lutas" search={{ servidor: "americas" }} className="hover:text-foreground">Lutas</Link>
          <Link to="/kills" search={{ servidor: "americas" }} className="hover:text-foreground">Kills</Link>
          <Link to="/builds" className="hover:text-foreground">Builds</Link>
          <Link to="/perfil" className="hover:text-foreground">Meu perfil</Link>
          {WORLD_MAP_ENABLED && <Link to="/mapa" className="hover:text-foreground">Mapa</Link>}
        </nav>
      </div>
    </footer>
  );
}
