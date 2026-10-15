import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ eventId: z.string().uuid() });

/** Posta o conteúdo no canal do Discord (ou atualiza a mensagem se já foi postado). Só quem pode editar o conteúdo. */
export const postEventToDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data, context }): Promise<{ ok: true; updated: boolean } | { ok: false; error: string }> => {
    const { data: allowed, error: accessError } = await context.supabase.rpc("can_edit_event", { _event_id: data.eventId });
    if (accessError || !allowed) return { ok: false, error: "Você não pode postar este conteúdo." };
    const { discordConfig, loadEvent, sendEventMessage, editEventMessage } = await import("@/lib/discord.server");
    const cfg = discordConfig();
    if (!cfg.botToken || !cfg.channelId) return { ok: false, error: "O Discord ainda não foi configurado no servidor (DISCORD_BOT_TOKEN e DISCORD_CHANNEL_ID)." };
    try {
      const event = await loadEvent(data.eventId);
      if (!event) return { ok: false, error: "Conteúdo não encontrado." };
      const { data: post } = await context.supabase.from("discord_posts").select("channel_id,message_id").eq("event_id", data.eventId).maybeSingle();
      let updated = false;
      let sent: { id: string; channel_id: string } | null = null;
      if (post) {
        try { await editEventMessage(event, post.channel_id, post.message_id, cfg); updated = true; }
        catch { /* mensagem apagada no Discord: posta de novo */ }
      }
      if (!updated) {
        sent = await sendEventMessage(event, cfg);
        const { error } = await context.supabase.from("discord_posts").upsert({ event_id: data.eventId, channel_id: sent.channel_id, message_id: sent.id });
        if (error) return { ok: false, error: "Postou no Discord, mas não conseguiu guardar a mensagem para atualizar depois." };
      }
      return { ok: true, updated };
    } catch (error) {
      console.error("[discord] post", error);
      return { ok: false, error: "Não foi possível falar com o Discord. Confira o token do bot e se ele tem acesso ao canal." };
    }
  });

const lastRefresh = new Map<string, number>();

/** Atualiza as vagas na mensagem do Discord depois de um ping/remoção feitos no site. Silencioso se não houver post. */
export const refreshDiscordMessage = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const now = Date.now();
    if (now - (lastRefresh.get(data.eventId) ?? 0) < 3000) return { ok: true };
    lastRefresh.set(data.eventId, now);
    if (lastRefresh.size > 500) lastRefresh.clear();
    try {
      const { discordConfig, loadEvent, editEventMessage, anonClient } = await import("@/lib/discord.server");
      const cfg = discordConfig();
      if (!cfg.botToken) return { ok: false };
      const { data: post } = await anonClient().from("discord_posts").select("channel_id,message_id").eq("event_id", data.eventId).maybeSingle();
      if (!post) return { ok: true };
      const event = await loadEvent(data.eventId);
      if (!event) return { ok: false };
      await editEventMessage(event, post.channel_id, post.message_id, cfg);
      return { ok: true };
    } catch (error) {
      console.error("[discord] refresh", error);
      return { ok: false };
    }
  });
