import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthForm, useSession } from "@/components/panel-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchProfile, profileDefaults, saveProfile, validateNick, type Profile } from "@/lib/profiles";

/** `nick`: nick do Albion da pessoa logada. `legacy`: o perfil ainda não existe no Supabase (migração 0014), então o site pede o nick como antes. */
type MyNick = { nick: string | null; legacy: boolean };
const MyNickContext = createContext<MyNick>({ nick: null, legacy: true });
export function useMyNick() { return useContext(MyNickContext); }

type UserLike = { id: string; email?: string | undefined; user_metadata?: Record<string, unknown> | undefined };

function NickSetup({ user, profile }: { user: UserLike; profile: Profile | null }) {
  const qc = useQueryClient();
  const [nick, setNick] = useState("");
  const [saving, setSaving] = useState(false);
  const defaults = profileDefaults(user);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const checked = validateNick(nick);
    if ("error" in checked) { toast.error(checked.error); return; }
    setSaving(true);
    try {
      await saveProfile(user.id, profile?.avatar_url ?? defaults.avatar_url, {
        display_name: profile?.display_name ?? defaults.display_name, albion_nick: checked.nick,
        albion_guild: profile?.albion_guild ?? null, guild_id: profile?.guild_id ?? null, guild_leader: profile?.guild_leader ?? false,
      });
      await qc.invalidateQueries({ queryKey: ["profile", user.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui salvar seu nick.");
    } finally { setSaving(false); }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-extrabold">Qual é o seu nick no Albion?</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pedimos só desta vez. Ele aparece nos seus pings e no chat dos conteúdos, e você pode mudar depois em Meu perfil.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <Label htmlFor="first-nick">Nick no jogo</Label>
        <Input id="first-nick" autoFocus value={nick} onChange={(e) => setNick(e.target.value)} maxLength={32} placeholder="Seu nick no Albion Online" />
        <Button type="submit" variant="gold" disabled={saving} className="w-full">{saving ? "Salvando..." : "Continuar"}</Button>
      </form>
    </main>
  );
}

function Gate({ user, children }: { user: UserLike; children: ReactNode }) {
  const profile = useQuery({ queryKey: ["profile", user.id], queryFn: () => fetchProfile(user.id), retry: false });
  if (profile.isPending) return <p className="p-10 text-center text-muted-foreground">Carregando seu perfil...</p>;
  if (profile.isError) return <p role="alert" className="p-10 text-center text-destructive">Não foi possível carregar seu perfil. <button type="button" className="underline" onClick={() => void profile.refetch()}>Tentar de novo</button></p>;
  if (!profile.data.available) return <MyNickContext.Provider value={{ nick: null, legacy: true }}>{children}</MyNickContext.Provider>;
  const nick = profile.data.profile?.albion_nick?.trim() || null;
  if (!nick) return <NickSetup user={user} profile={profile.data.profile} />;
  return <MyNickContext.Provider value={{ nick, legacy: false }}>{children}</MyNickContext.Provider>;
}

/** Só mostra o conteúdo para quem está logado e já tem o nick do Albion no perfil. */
export function RequireLogin({ redirectPath, children }: { redirectPath: string; children: ReactNode }) {
  const session = useSession();
  if (session === undefined) return <p className="p-10 text-center text-muted-foreground">Carregando...</p>;
  if (!session) return <AuthForm redirectPath={redirectPath} title="Entre para ver e pingar nos conteúdos" />;
  return <Gate key={session.user.id} user={session.user}>{children}</Gate>;
}
