import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectDiscordChannel, getDiscordInfo, registerDiscordCommand, syncWeaponEmojis } from "@/lib/discord.functions";

export type DiscordChannel = { id: string; label: string | null; guild_id: string; channel_id: string };

export function useDiscordChannels() {
  return useQuery({
    queryKey: ["discord-channels"],
    queryFn: async (): Promise<DiscordChannel[]> => {
      const { data, error } = await supabase.from("discord_channels").select("id,label,guild_id,channel_id").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Conectar canais do Discord do próprio servidor (código gerado pelo comando /pingorax conectar). */
export function DiscordPanel({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const channels = useDiscordChannels();
  const info = useQuery({ queryKey: ["discord-info"], queryFn: () => getDiscordInfo(), staleTime: 300_000 });
  const connect = useServerFn(connectDiscordChannel);
  const register = useServerFn(registerDiscordCommand);
  const syncEmojis = useServerFn(syncWeaponEmojis);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const result = await connect({ data: { code } });
      if (result.ok) { toast.success(`Canal ${result.label} conectado.`); setCode(""); void qc.invalidateQueries({ queryKey: ["discord-channels"] }); }
      else toast.error(result.error);
    } catch { toast.error("Não foi possível conectar o canal."); }
    finally { setBusy(false); }
  }
  async function remove(channel: DiscordChannel) {
    if (!confirm(`Desconectar ${channel.label ?? "este canal"}? Mensagens já postadas continuam no Discord.`)) return;
    const { error } = await supabase.from("discord_channels").delete().eq("id", channel.id);
    if (error) { toast.error("Não foi possível desconectar."); return; }
    void qc.invalidateQueries({ queryKey: ["discord-channels"] });
  }
  async function registerCommand() {
    try {
      const result = await register();
      if (result.ok) toast.success("Comandos registrados no Discord (/pingorax conectar, /luta, /kill e /build).");
      else toast.error(result.error);
    } catch { toast.error("Não foi possível registrar o comando."); }
  }

  async function createAllEmojis() {
    setSyncing("Começando...");
    let made = 0;
    try {
      for (let round = 0; round < 60; round++) {
        const result = await syncEmojis();
        if (!result.ok) { toast.error(result.error); return; }
        made += result.created;
        setSyncing(`${made} criados, faltam ${result.remaining}...`);
        if (result.remaining === 0) { toast.success(made ? `Pronto: ${made} ícones novos criados.` : "Todos os ícones já existem."); return; }
        if (result.rateLimited) { toast.warning(`O Discord pediu uma pausa. ${made} criados, faltam ${result.remaining}. Clique de novo daqui a alguns minutos.`); return; }
        if (result.created === 0) { toast.error(`Não consegui criar ${result.remaining} ícones (falha no download do Albion).`); return; }
      }
    } catch { toast.error("Não foi possível criar os ícones."); }
    finally { setSyncing(null); }
  }

  return (
    <details className="mt-6 rounded-xl border border-border bg-card/60 p-4">
      <summary className="cursor-pointer text-sm font-bold uppercase tracking-widest text-primary">Discord do meu servidor</summary>
      <div className="mt-3 space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Peça a quem administra o servidor para <strong className="text-foreground">adicionar o bot</strong> ao servidor{info.data?.invite && <> (<a className="inline-flex items-center gap-0.5 text-primary underline" href={info.data.invite} target="_blank" rel="noreferrer">link do convite <ExternalLink className="h-3 w-3" /></a>)</>}.</li>
          <li>No canal onde os conteúdos serão postados, quem tem a permissão <strong className="text-foreground">Gerenciar Servidor</strong> digita <code className="rounded bg-background/60 px-1">/pingorax conectar</code>. O bot responde com um código.</li>
          <li>Cole o código aqui e clique em Conectar. Depois use <strong className="text-foreground">Postar no Discord</strong> nos seus conteúdos.</li>
        </ol>
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <Input className="min-w-0 flex-1 basis-64" aria-label="Código de conexão" placeholder="Cole o código do bot" value={code} disabled={busy} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" variant="gold" disabled={busy || !code.trim()}>{busy ? "Conectando..." : "Conectar"}</Button>
        </form>
        <ul className="space-y-2" aria-label="Canais conectados">
          {channels.data?.length === 0 && <li className="text-muted-foreground">Nenhum canal conectado ainda.</li>}
          {channels.data?.map((channel) => (
            <li key={channel.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              <span className="min-w-0 flex-1 truncate">{channel.label ?? channel.channel_id}</span>
              <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Desconectar ${channel.label ?? channel.channel_id}`} onClick={() => remove(channel)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Administrador: registre os comandos (<code>/pingorax conectar</code>, <code>/luta</code>, <code>/kill</code> e <code>/build</code>; precisa da variável <code>DISCORD_APP_ID</code>) e deixe o bot público no Discord Developer Portal. Clique de novo sempre que o site ganhar comandos novos.</p>
            <Button className="mt-2" size="sm" variant="outline" onClick={registerCommand}>Registrar comandos do bot</Button>
            <p className="mt-3 text-xs text-muted-foreground">Ícones das armas no card: cria de uma vez o emoji de todas as armas do catálogo (leva alguns minutos; pode deixar a tela aberta).</p>
            <Button className="mt-2" size="sm" variant="outline" disabled={!!syncing} onClick={createAllEmojis}>{syncing ?? "Criar ícones de todas as armas"}</Button>
          </div>
        )}
      </div>
    </details>
  );
}
