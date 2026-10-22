import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Fail = { ok: false; error: string };

/** A sala só aparece quando o LiveKit está configurado no servidor. */
export const getVoiceStatus = createServerFn({ method: "GET" }).handler(async (): Promise<{ enabled: boolean }> => {
  const { livekitConfig } = await import("@/lib/voice.server");
  return { enabled: livekitConfig() !== null };
});

/** Entrega a chave de acesso da sala do conteúdo, só para quem pingou, o caller ou quem gerencia o conteúdo. */
export const getVoiceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ eventId: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }): Promise<{ ok: true; url: string; token: string; name: string } | Fail> => {
    const { livekitConfig, signLiveKitToken } = await import("@/lib/voice.server");
    const { canJoinVoice, roomName } = await import("@/lib/voice");
    const cfg = livekitConfig();
    if (!cfg) return { ok: false, error: "A sala de voz ainda não foi configurada no servidor." };
    const { looksSwapped } = await import("@/lib/voice.server");
    if (looksSwapped(cfg.apiKey, cfg.apiSecret)) return { ok: false, error: "LIVEKIT_API_KEY e LIVEKIT_API_SECRET parecem trocados: a key começa com \"API\"." };

    const { supabase, userId } = context;
    const [profile, event, signups, waitlist, manager] = await Promise.all([
      supabase.from("profiles").select("albion_nick").eq("user_id", userId).maybeSingle(),
      supabase.from("events").select("caller_name").eq("id", data.eventId).maybeSingle(),
      supabase.from("signups").select("nick").eq("event_id", data.eventId),
      supabase.from("waitlist").select("nick").eq("event_id", data.eventId),
      supabase.rpc("can_manage_event", { _event_id: data.eventId }),
    ]);
    if (!event.data) return { ok: false, error: "Conteúdo não encontrado." };
    const nick = profile.data?.albion_nick?.trim() || null;
    const allowed = canJoinVoice({
      nick, signups: (signups.data ?? []).map((r) => r.nick), waitlist: (waitlist.data ?? []).map((r) => r.nick),
      caller: event.data.caller_name, manager: manager.data === true,
    });
    if (!allowed) return { ok: false, error: "Só quem pingou neste conteúdo entra na sala de voz." };

    const name = nick ?? "Gerente";
    const token = await signLiveKitToken({ apiKey: cfg.apiKey, apiSecret: cfg.apiSecret, room: roomName(data.eventId), identity: userId, name });
    return { ok: true, url: cfg.url, token, name };
  });
