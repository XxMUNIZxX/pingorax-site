import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDiscordChannels } from "@/components/discord-panel";
import { usePanelAccess } from "@/components/panel-access";
import { postAnalysisToDiscord } from "@/lib/discord.functions";
import type { Server } from "@/lib/albion-types";

/** Manda a análise da luta (ou a kill) para um canal do Discord pelo bot. */
export function SendToDiscord({ kind, server, id }: { kind: "battle" | "kill"; server: Server; id: number }) {
  const access = usePanelAccess();
  const channels = useDiscordChannels();
  const send = useServerFn(postAnalysisToDiscord);
  const [busy, setBusy] = useState(false);

  async function post(channelRowId?: string) {
    setBusy(true);
    try {
      const result = await send({ data: { kind, server, id, ...(channelRowId ? { channelRowId } : {}) } });
      if (result.ok) toast.success("Enviado para o Discord.");
      else toast.error(result.error);
    } catch { toast.error("Não foi possível enviar agora."); }
    finally { setBusy(false); }
  }

  if (!access.session) {
    return <Button variant="outline" size="sm" onClick={() => toast.info("Entre na sua conta (aba Builds ou Criar conteúdo) e conecte um canal para enviar ao Discord.")}><Send /> Enviar ao Discord</Button>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={busy}><Send /> {busy ? "Enviando..." : "Enviar ao Discord"}</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Escolha o canal</DropdownMenuLabel>
        {(channels.data ?? []).map((channel) => <DropdownMenuItem key={channel.id} onSelect={() => void post(channel.id)}>{channel.label ?? channel.channel_id}</DropdownMenuItem>)}
        {access.isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void post()}>Canal padrão do site</DropdownMenuItem></>}
        {(channels.data?.length ?? 0) === 0 && !access.isAdmin && <DropdownMenuItem disabled>Conecte um canal em "Discord do meu servidor"</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
