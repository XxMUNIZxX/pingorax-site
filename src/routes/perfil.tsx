import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthForm, useSession } from "@/components/panel-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchProfile, listGuildOptions, profileDefaults, saveProfile, validateProfile, type ProfileForm } from "@/lib/profiles";
import { fetchMyGuilds } from "@/lib/guilds";
import { MyPingsPanel } from "@/components/my-pings";
import { LoggerTokens } from "@/components/logger-tokens";

export const Route = createFileRoute("/perfil")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Meu perfil — PingoraX" },
    { name: "description", content: "Seu perfil no PingoraX: nome, nick no Albion Online e guilda." },
    { name: "robots", content: "noindex" },
  ] }),
  component: ProfilePage,
});

function ProfilePage() {
  const session = useSession();
  if (session === undefined) return <p className="p-10 text-center text-muted-foreground">Carregando...</p>;
  if (!session) return <AuthForm redirectPath="/perfil" title="Entrar no PingoraX" />;
  return <ProfileEditor key={session.user.id} user={session.user} />;
}

function ProfileEditor({ user }: { user: { id: string; email?: string | undefined; user_metadata?: Record<string, unknown> | undefined } }) {
  const qc = useQueryClient();
  const defaults = profileDefaults(user);
  const profile = useQuery({ queryKey: ["profile", user.id], queryFn: () => fetchProfile(user.id), retry: false });
  const guilds = useQuery({ queryKey: ["guild-options"], queryFn: listGuildOptions, staleTime: 60_000 });
  const owned = useQuery({ queryKey: ["my-guilds", user.id], queryFn: () => fetchMyGuilds(user.id), retry: false });
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile.data || form) return;
    const p = profile.data.profile;
    setForm({ display_name: p?.display_name ?? defaults.display_name, albion_nick: p?.albion_nick ?? "", albion_guild: p?.albion_guild ?? "", guild_id: p?.guild_id ?? null, guild_leader: p?.guild_leader ?? false });
  }, [profile.data, form, defaults.display_name]);

  const avatar = profile.data?.profile?.avatar_url ?? defaults.avatar_url;
  const set = (patch: Partial<ProfileForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const hasGuild = !!form && (!!form.guild_id || form.albion_guild.trim().length > 0);

  async function save() {
    if (!form) return;
    const checked = validateProfile(form);
    if ("error" in checked) { toast.error(checked.error); return; }
    setSaving(true);
    try {
      await saveProfile(user.id, avatar, checked.fields);
      toast.success("Perfil salvo!");
      void qc.invalidateQueries({ queryKey: ["profile", user.id] });
      void qc.invalidateQueries({ queryKey: ["guild-people"] });
    } catch { toast.error("Não foi possível salvar o perfil."); }
    finally { setSaving(false); }
  }

  if (profile.isPending) return <p className="p-10 text-center text-muted-foreground">Carregando perfil...</p>;
  if (profile.isError) return <p role="alert" className="p-10 text-center text-destructive">Não foi possível carregar o perfil.</p>;
  if (!profile.data.available) return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold text-gold">Meu perfil</h1>
      <p className="mt-3 text-muted-foreground">Os perfis ainda não foram ativados neste site (falta rodar a migração 0014 no Supabase).</p>
      <Button className="mt-4" variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
    </main>
  );
  if (!form) return null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-center gap-4">
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full border border-border object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-full border border-border bg-secondary text-2xl font-bold">{form.display_name.slice(0, 1).toUpperCase()}</div>}
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold text-gold">Meu perfil</h1>
          {user.email && <p className="break-all text-sm text-muted-foreground">{user.email}</p>}
        </div>
      </div>
      <MyPingsPanel nick={profile.data.profile?.albion_nick?.trim() || null} />
      <LoggerTokens userId={user.id} />
      {!profile.data.profile && <p className="mt-4 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">Bem-vindo! Preenchi seu nome com os dados do login. Confira e clique em Salvar.</p>}

      <fieldset disabled={saving} className="mt-6 space-y-5">
        <div className="space-y-1"><Label htmlFor="profile-name">Nome de exibição</Label><Input id="profile-name" maxLength={40} value={form.display_name} onChange={(e) => set({ display_name: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="profile-nick">Nick no Albion Online</Label><Input id="profile-nick" maxLength={32} placeholder="Como você aparece no jogo" value={form.albion_nick} onChange={(e) => set({ albion_nick: e.target.value })} /></div>

        <div className="space-y-1">
          <Label htmlFor="profile-guild">Guilda no PingoraX</Label>
          <Select value={form.guild_id ?? "none"} onValueChange={(v) => set({ guild_id: v === "none" ? null : v })}>
            <SelectTrigger id="profile-guild"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Nenhuma</SelectItem>{(guilds.data ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Só aparecem guildas que já têm página no PingoraX. Você aparece na lista de membros dela.</p>
        </div>
        <div className="space-y-1"><Label htmlFor="profile-albion-guild">Guilda no jogo (nome)</Label><Input id="profile-albion-guild" maxLength={40} placeholder="Opcional, se a sua não tem página aqui" value={form.albion_guild} onChange={(e) => set({ albion_guild: e.target.value })} /></div>

        <label className={`flex items-start gap-3 rounded-md border border-border p-3 ${hasGuild ? "" : "opacity-60"}`}>
          <Switch checked={hasGuild && form.guild_leader} disabled={!hasGuild} onCheckedChange={(v) => set({ guild_leader: v })} aria-label="Sou líder da guilda" />
          <span className="text-sm"><span className="font-semibold">Sou líder da guilda</span><br /><span className="text-muted-foreground">É uma declaração sua e aparece como “líder declarado”. Não dá nenhuma permissão extra no site.</span></span>
        </label>

        {(owned.data?.length ?? 0) > 0 && (
          <p className="text-sm text-muted-foreground">Você é o dono da página: {owned.data!.map((g, i) => <span key={g.id}>{i > 0 && ", "}<Link to="/g/$slug" params={{ slug: g.slug }} className="text-primary hover:underline">{g.name}</Link></span>)}. O dono aparece como líder de verdade.</p>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
          <Button type="button" variant="gold" onClick={() => void save()}>{saving ? "Salvando..." : "Salvar perfil"}</Button>
        </div>
      </fieldset>
    </main>
  );
}
