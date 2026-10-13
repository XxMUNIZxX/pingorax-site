import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Member = { user_id: string; email: string; is_admin: boolean; is_creator: boolean; created_at: string };

async function loadTeam(): Promise<Member[]> {
  const { data, error } = await supabase.rpc("admin_panel_directory");
  if (error) throw error;
  return (data ?? []) as Member[];
}

export function TeamPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: team, isLoading, error: loadError } = useQuery({
    queryKey: ["team"],
    queryFn: loadTeam,
    enabled: open,
  });

  async function toggle(m: Member, role: "admin" | "creator") {
    setBusy(m.user_id);
    const granted = role === "admin" ? m.is_admin : m.is_creator;
    const { data, error } = await supabase.rpc("admin_set_panel_role", {
      _email: m.email,
      _role: role,
      _grant: !granted,
    });
    setBusy(null);
    if (error) {
      toast.error("Não foi possível atualizar o acesso.");
      return;
    }
    const status = data as string;
    if (status === "self") toast.error("Você não pode remover o seu próprio acesso.");
    else if (status === "last") toast.error("Você é a única pessoa com acesso. Adicione outra antes de remover.");
    else if (status === "not_found") toast.error("Essa conta não foi encontrada.");
    else {
      toast.success(granted ? "Acesso removido." : "Acesso liberado.");
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["panel-roles"] });
    }
  }

  const admins = (team ?? []).filter((m) => m.is_admin).length;

  return (
    <section className="panel mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gold">Acessos da equipe</h2>
          <p className="text-sm text-muted-foreground">
            Criadores gerenciam seus próprios conteúdos. Administradores gerenciam todos os conteúdos e os acessos da equipe.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? "Fechar" : "Gerenciar equipe"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
             {isLoading ? "Carregando..." : `${admins} administradores`}
          </p>

           {loadError && <p role="alert" className="mt-3 text-sm text-destructive">Não foi possível carregar a equipe.</p>}
           <ul className="mt-3 space-y-2">
            {(team ?? []).map((m) => (
              <li
                key={m.user_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.email}</p>
                  <p className="text-xs text-muted-foreground">
                    conta criada em {new Date(m.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                 <div className="flex flex-wrap items-center gap-2">
                   {m.is_admin && <Badge>Administrador</Badge>}
                   {!m.is_admin && m.is_creator && <Badge>Criador</Badge>}
                   {!m.is_admin && <Button size="sm" variant={m.is_creator ? "ghost" : "secondary"} disabled={busy === m.user_id} onClick={() => toggle(m, "creator")}>
                     {m.is_creator ? "Remover criação" : "Liberar criação"}
                   </Button>}
                  <Button
                    size="sm"
                    variant={m.is_admin ? "ghost" : "secondary"}
                    disabled={busy === m.user_id}
                     onClick={() => toggle(m, "admin")}
                  >
                     {m.is_admin ? "Remover administração" : "Tornar administrador"}
                  </Button>
                </div>
              </li>
            ))}
            {!isLoading && (team ?? []).length === 0 && (
              <li className="text-sm text-muted-foreground">Nenhuma conta criada ainda.</li>
            )}
          </ul>

          <p className="mt-3 text-xs text-muted-foreground">
            A pessoa precisa criar conta no painel antes de você liberar. Mande o link do painel para ela se cadastrar.
          </p>
        </div>
      )}
    </section>
  );
}
