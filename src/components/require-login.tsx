import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthForm, useSession } from "@/components/panel-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchProfile, profileDefaults, saveProfile, validateNick, type Profile } from "@/lib/profiles";

/**
 * Quem está olhando a página:
 * - loading: ainda verificando; anon: sem login; needs-nick: logou mas falta o nick do Albion;
 * - ready: logado com nick (`nick`); legacy: o perfil ainda não existe no Supabase (migração 0014), então o site pede o nick como antes.
 */
export type MyNick = { status: "loading" | "anon" | "needs-nick" | "ready" | "legacy"; nick: string | null; legacy: boolean; user: UserLike | null; profile: Profile | null };
const MyNickContext = createContext<MyNick>({ status: "loading", nick: null, legacy: false, user: null, profile: null });
export function useMyNick() { return useContext(MyNickContext); }

type UserLike = { id: string; email?: string | undefined; user_metadata?: Record<string, unknown> | undefined };

/** Pergunta o nick do Albion uma vez (só para quem vai pingar). */
export function NickSetup({ user, profile }: { user: UserLike; profile: Profile | null }) {
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
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <h3 className="font-bold">Qual é o seu nick no Albion?</h3>
      <p className="text-sm text-muted-foreground">Pedimos só desta vez. Ele aparece nos seus pings e no chat, e dá para mudar depois em Meu perfil.</p>
      <Label htmlFor="first-nick" className="sr-only">Nick no jogo</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="first-nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={32} placeholder="Seu nick no Albion Online" />
        <Button type="submit" variant="gold" disabled={saving}>{saving ? "Salvando..." : "Continuar"}</Button>
      </div>
    </form>
  );
}

function ProfileState({ user, children }: { user: UserLike; children: ReactNode }) {
  const profile = useQuery({ queryKey: ["profile", user.id], queryFn: () => fetchProfile(user.id), retry: false });
  let value: MyNick = { status: "loading", nick: null, legacy: false, user, profile: null };
  if (profile.data) {
    const p = profile.data.profile;
    const nick = p?.albion_nick?.trim() || null;
    if (!profile.data.available) value = { status: "legacy", nick: null, legacy: true, user, profile: null };
    else if (!nick) value = { status: "needs-nick", nick: null, legacy: false, user, profile: p };
    else value = { status: "ready", nick, legacy: false, user, profile: p };
  } else if (profile.isError) value = { status: "legacy", nick: null, legacy: true, user, profile: null };
  return <MyNickContext.Provider value={value}>{children}</MyNickContext.Provider>;
}

/** Diz quem está logado e qual é o nick dele, sem bloquear a página: ver conteúdo é livre, só pingar pede login. */
export function MyNickProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session === undefined) return <MyNickContext.Provider value={{ status: "loading", nick: null, legacy: false, user: null, profile: null }}>{children}</MyNickContext.Provider>;
  if (!session) return <MyNickContext.Provider value={{ status: "anon", nick: null, legacy: false, user: null, profile: null }}>{children}</MyNickContext.Provider>;
  return <ProfileState key={session.user.id} user={session.user}>{children}</ProfileState>;
}

/** No lugar do botão de pingar: pede login ou o nick, conforme o caso. */
export function PingGate({ redirectPath }: { redirectPath: string }) {
  const me = useMyNick();
  if (me.status === "anon") return <AuthForm redirectPath={redirectPath} title="Entre para pingar" />;
  if (me.status === "needs-nick" && me.user) return <NickSetup user={me.user} profile={me.profile} />;
  if (me.status === "loading") return <p className="text-sm text-muted-foreground">Verificando seu login...</p>;
  return null;
}
