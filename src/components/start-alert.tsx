import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { useSession } from "@/components/panel-access";
import { fetchProfile } from "@/lib/profiles";
import { fetchMyPings } from "@/lib/my-pings";
import { nextStarting, startText, startsInMinutes } from "@/lib/upcoming";

const NOTIFIED = "pingorax:notified-start";
const read = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { sessionStorage.setItem(key, value); } catch { /* sem armazenamento: tudo bem */ } };

/** Faixa no topo do site: o conteúdo em que você pingou está para começar. Só enquanto o site está aberto. */
export function StartAlert() {
  const session = useSession();
  const userId = session?.user.id ?? null;
  const profile = useQuery({ queryKey: ["profile", userId], queryFn: () => fetchProfile(userId!), enabled: !!userId, retry: false, staleTime: 5 * 60_000 });
  const nick = profile.data?.profile?.albion_nick?.trim() || null;
  const pings = useQuery({ queryKey: ["my-pings", nick], queryFn: () => fetchMyPings(nick!), enabled: !!nick, staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false });
  const [now, setNow] = useState(() => Date.now());
  const [closed, setClosed] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const next = pings.data ? nextStarting(pings.data.upcoming, now) : null;

  // Uma notificação do navegador por conteúdo, só se a pessoa já liberou (nunca pedimos sozinhos).
  useEffect(() => {
    if (!next || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (read(NOTIFIED) === next.id) return;
    write(NOTIFIED, next.id);
    try { new Notification(`${next.title} ${startText(startsInMinutes(next.starts_at))}`, { body: "Abra o PingoraX para ver o chat e a sala de voz.", tag: next.id }); } catch { /* alguns navegadores móveis não permitem */ }
  }, [next]);

  if (!next || closed === next.id) return null;
  const canAsk = typeof Notification !== "undefined" && Notification.permission === "default";
  return (
    <div role="status" className="border-b border-primary/40 bg-primary/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
        <Bell className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1"><b>{next.title}</b> {startText(startsInMinutes(next.starts_at, now))}.</span>
        <Link to="/evento/$id" params={{ id: next.id }} className="font-semibold text-primary underline">Abrir</Link>
        {canAsk && <button type="button" className="underline" onClick={() => void Notification.requestPermission().then(() => setNow(Date.now()))}>Avisar no navegador</button>}
        <button type="button" aria-label="Fechar aviso" className="rounded p-1 hover:bg-primary/20" onClick={() => setClosed(next.id)}><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
