import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthForm, useSession } from "@/components/panel-access";
import { SpaceView } from "@/components/space-view";
import { fetchMySpaces, joinWithCode } from "@/lib/spaces";

export const Route = createFileRoute("/sala")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { convite?: string } => (typeof search.convite === "string" && search.convite.length <= 40 ? { convite: search.convite } : {}),
  head: () => ({ meta: [
    { title: "Sala da guilda — PingoraX" },
    { name: "description", content: "Chat e voz da sua guilda no PingoraX." },
    { name: "robots", content: "noindex" },
  ] }),
  component: SalaPage,
});

function SalaPage() {
  const session = useSession();
  const { convite } = Route.useSearch();
  if (session === undefined) return <p className="p-10 text-center text-muted-foreground">Carregando...</p>;
  if (!session) return <AuthForm redirectPath={convite ? `/sala?convite=${encodeURIComponent(convite)}` : "/sala"} title="Entre para acessar a sala da guilda" />;
  return <SalaLoader key={session.user.id} userId={session.user.id} invite={convite} />;
}

function SalaLoader({ userId, invite }: { userId: string; invite: string | undefined }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const spaces = useQuery({ queryKey: ["spaces", userId], queryFn: () => fetchMySpaces(userId), retry: false });

  // Link de convite: entra na guilda uma vez e limpa o endereço.
  useEffect(() => {
    if (!invite) return;
    let alive = true;
    joinWithCode(invite)
      .then(async (slug) => {
        await qc.invalidateQueries({ queryKey: ["spaces", userId] });
        if (alive) { toast.success("Você entrou na guilda!"); try { localStorage.setItem("pingorax.sala.guild", slug); } catch { /* sem armazenamento */ } }
      })
      .catch((err: unknown) => { if (alive) toast.error(err instanceof Error ? err.message : "Não consegui usar o convite."); })
      .finally(() => { if (alive) void navigate({ to: "/sala", search: {}, replace: true }); });
    return () => { alive = false; };
  }, [invite, userId, qc, navigate]);

  if (spaces.isLoading) return <p className="p-10 text-center text-muted-foreground">Carregando suas guildas...</p>;
  if (spaces.isError) return <p role="alert" className="p-10 text-center text-destructive">Não foi possível carregar a sala. Tente de novo em instantes.</p>;
  if (spaces.data === null) return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-extrabold">Sala da guilda</h1><p className="mt-3 text-muted-foreground">Esta função ainda não foi ativada neste site. Quem administra precisa rodar a migração 0024 no Supabase.</p></main>;
  return <SpaceView userId={userId} spaces={spaces.data ?? []} />;
}
