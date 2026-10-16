import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ eventId: z.string().uuid() });
const postInput = z.object({ eventId: z.string().uuid(), channelRowId: z.string().uuid().optional() });

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Posta o conteúdo num canal do Discord (ou atualiza a mensagem se já estiver nele). Só quem pode editar o conteúdo.
 * Com `channelRowId`: canal que o próprio criador conectou. Sem ele: canal padrão do site, só para administradores.
 */
export const postEventToDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => postInput.parse(value))
  .handler(async ({ data, context }): Promise<Result<{ updated: boolean }>> => {
    const { data: allowed, error: accessError } = await context.supabase.rpc("can_edit_event", { _event_id: data.eventId });
    if (accessError || !allowed) return { ok: false, error: "Você não pode postar este conteúdo." };
    const { discordConfig, loadEvent, sendEventMessage, editEventMessage } = await import("@/lib/discord.server");
    const cfg = discordConfig();
    if (!cfg.botToken) return { ok: false, error: "O Discord ainda não foi configurado no servidor (DISCORD_BOT_TOKEN)." };

    let channelId: string | undefined;
    if (data.channelRowId) {
      const { data: row } = await context.supabase.from("discord_channels").select("channel_id").eq("id", data.channelRowId).maybeSingle();
      if (!row) return { ok: false, error: "Esse canal não está conectado à sua conta." };
      channelId = row.channel_id;
    } else {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (!isAdmin) return { ok: false, error: "Conecte o canal do seu servidor para postar." };
      channelId = cfg.channelId;
    }
    if (!channelId) return { ok: false, error: "O canal padrão do Discord não está configurado (DISCORD_CHANNEL_ID)." };

    try {
      const event = await loadEvent(data.eventId);
      if (!event) return { ok: false, error: "Conteúdo não encontrado." };
      const { data: post } = await context.supabase.from("discord_posts").select("channel_id,message_id").eq("event_id", data.eventId).maybeSingle();
      let updated = false;
      if (post && post.channel_id === channelId) {
        try { await editEventMessage(event, post.channel_id, post.message_id, cfg); updated = true; }
        catch { /* mensagem apagada no Discord: posta de novo */ }
      }
      if (!updated) {
        const sent = await sendEventMessage(event, cfg, channelId);
        const { error } = await context.supabase.from("discord_posts").upsert({ event_id: data.eventId, channel_id: sent.channel_id, message_id: sent.id });
        if (error) return { ok: false, error: "Postou no Discord, mas não conseguiu guardar a mensagem para atualizar depois." };
      }
      return { ok: true, updated };
    } catch (error) {
      console.error("[discord] post", error);
      return { ok: false, error: "Não foi possível postar nesse canal. Confira se o bot está no servidor e tem permissão de ver e enviar mensagens nele." };
    }
  });

/** Liga à conta do criador o canal do código gerado pelo comando /pingorax conectar. */
export const connectDiscordChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ code: z.string().trim().min(10).max(120) }).parse(value))
  .handler(async ({ data, context }): Promise<Result<{ label: string }>> => {
    const { discordConfig, readLinkCode, getChannelInfo } = await import("@/lib/discord.server");
    const cfg = discordConfig();
    if (!cfg.botToken) return { ok: false, error: "O Discord ainda não foi configurado no servidor." };
    const parsed = await readLinkCode(cfg.botToken, data.code.replace(/\s+/g, ""));
    if (!parsed) return { ok: false, error: "Código inválido. Copie o código inteiro que o bot mostrou." };
    if (parsed === "expired") return { ok: false, error: "Esse código expirou. Use /pingorax conectar de novo no canal." };
    let label = `Canal ${parsed.channelId}`;
    try {
      const info = await getChannelInfo(parsed.channelId, cfg);
      if (info.name) label = `#${info.name}`;
    } catch { return { ok: false, error: "O bot não enxerga esse canal. Adicione o bot ao servidor e dê a ele permissão de ver o canal." }; }
    const { error } = await context.supabase.from("discord_channels").insert({ guild_id: parsed.guildId, channel_id: parsed.channelId, label });
    if (error && error.code !== "23505") return { ok: false, error: "Você precisa ser criador para conectar um canal." };
    return { ok: true, label };
  });

/** Dados públicos para a tela: link para adicionar o bot a um servidor. */
export const getDiscordInfo = createServerFn({ method: "GET" }).handler(async (): Promise<{ invite: string | null; configured: boolean }> => {
  const { serverEnv } = await import("@/lib/server-env");
  const appId = serverEnv("DISCORD_APP_ID");
  return {
    configured: !!serverEnv("DISCORD_BOT_TOKEN"),
    invite: appId && /^[0-9]{5,25}$/.test(appId) ? `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=3072` : null,
  };
});

/** Só administradores: cria o comando /pingorax conectar no Discord. */
export const registerDiscordCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false, error: "Somente administradores." };
    const { discordConfig, registerCommands } = await import("@/lib/discord.server");
    const { serverEnv } = await import("@/lib/server-env");
    const appId = serverEnv("DISCORD_APP_ID");
    if (!appId) return { ok: false, error: "Falta a variável DISCORD_APP_ID (Application ID do app no Discord)." };
    try { await registerCommands(appId, discordConfig()); return { ok: true }; }
    catch (error) { console.error("[discord] register", error); return { ok: false, error: "O Discord recusou o registro. Confira o DISCORD_APP_ID e o token do bot." }; }
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

/** Só administradores: cria um lote de emojis das armas do catálogo (o painel repete até acabar). */
export const syncWeaponEmojis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; total: number; created: number; failed: number; rateLimited: boolean; remaining: number } | { ok: false; error: string }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false, error: "Somente administradores." };
    try {
      const { discordConfig, syncCatalogEmojis } = await import("@/lib/discord.server");
      return { ok: true, ...(await syncCatalogEmojis(discordConfig())) };
    } catch (error) {
      console.error("[discord] sync emojis", error);
      return { ok: false, error: error instanceof Error && error.message.startsWith("Faltam") ? error.message : "O Discord recusou. Confira o DISCORD_APP_ID e o token do bot." };
    }
  });

const analysisInput = z.object({
  kind: z.enum(["battle", "kill"]), server: z.enum(["americas", "europe", "asia"]), id: z.number().int().positive(), channelRowId: z.string().uuid().optional(),
});

/** Manda a análise de uma luta ou uma kill do Albion para um canal do Discord (canal conectado pelo criador, ou o padrão do site para admin). */
export const postAnalysisToDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => analysisInput.parse(value))
  .handler(async ({ data, context }): Promise<Result> => {
    const { discordConfig, sendRawMessage } = await import("@/lib/discord.server");
    const cfg = discordConfig();
    if (!cfg.botToken) return { ok: false, error: "O Discord ainda não foi configurado no servidor (DISCORD_BOT_TOKEN)." };
    let channelId: string | undefined;
    if (data.channelRowId) {
      const { data: row } = await context.supabase.from("discord_channels").select("channel_id").eq("id", data.channelRowId).maybeSingle();
      if (!row) return { ok: false, error: "Esse canal não está conectado à sua conta." };
      channelId = row.channel_id;
    } else {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (!isAdmin) return { ok: false, error: "Conecte o canal do seu servidor para enviar." };
      channelId = cfg.channelId;
    }
    if (!channelId) return { ok: false, error: "O canal padrão do Discord não está configurado (DISCORD_CHANNEL_ID)." };
    let message: object;
    try {
      const { battleMessage, killMessage } = await import("@/lib/albion-discord.server");
      message = data.kind === "battle" ? await battleMessage(data.server, data.id) : await killMessage(data.server, data.id);
    } catch (error) {
      console.error("[discord] analise", error);
      return { ok: false, error: "Não consegui carregar isso do Albion agora. Tente de novo em instantes." };
    }
    try { await sendRawMessage(channelId, cfg, message); return { ok: true }; }
    catch (error) {
      console.error("[discord] enviar analise", error);
      return { ok: false, error: "Não foi possível enviar para esse canal. Confira se o bot está no servidor e pode ver e enviar mensagens nele." };
    }
  });
