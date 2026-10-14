import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SessionContext = createContext<Session | null | undefined>(undefined);
export function PanelSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>();
  const qc = useQueryClient();
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      setSession(next);
      if (event === "SIGNED_OUT") qc.clear();
      else if (event !== "INITIAL_SESSION") void qc.invalidateQueries();
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [qc]);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
export function usePanelAccess() {
  const session = useContext(SessionContext);
  const roles = useQuery({ queryKey: ["panel-roles", session?.user.id], enabled: !!session, queryFn: async () => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", session?.user.id ?? "");
    if (error) throw error;
    return data ?? [];
  } });
  const panel = useQuery({ queryKey: ["content-panel-access", session?.user.id], enabled: !!session, queryFn: async () => {
    const { data, error } = await supabase.rpc("can_access_content_panel");
    if (error) throw error;
    return !!data;
  } });
  const isAdmin = !!session && !!roles.data?.some(row => row.role === "admin");
  return { session, isAdmin, canCreate: isAdmin || (!!session && !!roles.data?.some(row => row.role === "creator")), canAccessPanel: !!session && !!panel.data, loading: session === undefined || (!!session && (roles.isPending || panel.isPending)), error: roles.error ?? panel.error };
}
export function PanelAccess({ adminOnly = false, children }: { adminOnly?: boolean; children: (access: { userId: string; isAdmin: boolean; canCreate: boolean }) => ReactNode }) {
  const access = usePanelAccess();
  if (access.loading) return <p className="p-10 text-center text-muted-foreground">Verificando acesso...</p>;
  if (!access.session) return <AuthForm />;
  if (access.error) return <p role="alert" className="p-10 text-center text-destructive">Não foi possível verificar seu acesso. Tente novamente.</p>;
  if (adminOnly ? !access.isAdmin : !access.canAccessPanel) return <main className="mx-auto max-w-md px-4 py-10 text-center">
    <h1 className="text-2xl font-bold text-gold">{adminOnly ? "Administração restrita" : "Aguardando liberação"}</h1>
    <p className="mt-4 text-muted-foreground">{adminOnly ? "Somente administradores podem gerenciar a equipe e as configurações do site." : "Peça a um administrador para liberar seu acesso de criação."}</p>
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      <Button variant="outline" asChild><Link to={adminOnly ? "/criar" : "/"}>{adminOnly ? "Criação de conteúdo" : "Ver conteúdos"}</Link></Button>
      <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sair</Button>
    </div>
  </main>;
  return children({ userId: access.session.user.id, isAdmin: access.isAdmin, canCreate: access.canCreate });
}

export function useSession() { return useContext(SessionContext); }

export function AuthForm({ redirectPath = "/criar", title }: { redirectPath?: string; title?: string }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("Email ou senha inválidos");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${redirectPath}` } });
      if (error) toast.error(error.message);
      else if (!data.session) toast.success("Confira seu email para confirmar a conta.");
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <form onSubmit={submit} className="panel space-y-4 p-6">
        <h1 className="text-2xl font-bold text-gold">{title ?? (mode === "in" ? "Entrar" : "Criar conta")}</h1>
        <div className="space-y-1"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label>Senha</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button variant="gold" className="w-full" disabled={loading}>{mode === "in" ? "Entrar" : "Cadastrar"}</Button>
        <Button variant="ghost" type="button" className="w-full text-sm text-muted-foreground hover:text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Primeira vez? Criar conta" : "Já tenho conta"}
        </Button>
      </form>
    </main>
  );
}

