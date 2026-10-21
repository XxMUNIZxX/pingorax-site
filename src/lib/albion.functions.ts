import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BattleDetail, BattleKills, BattleListItem, GuildHit, GuildProfile, KillDetail, KillSummary, PlayerHit, PlayerProfile } from "@/lib/albion-types";

const server = z.enum(["americas", "europe", "asia"]);

/** Batalhas recentes (públicas). Filtra por mínimo de jogadores e por nome de guilda/aliança/jogador. */
export const fetchBattleList = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({
    server, page: z.number().int().min(0).max(20).default(0), minPlayers: z.number().int().min(0).max(500).default(0), query: z.string().max(60).default(""),
  }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; battles: BattleListItem[] } | { ok: false; error: string }> => {
    try {
      const { listBattles } = await import("@/lib/albion.server");
      return { ok: true, battles: await listBattles(data.server, data.page, data.minPlayers, data.query) };
    } catch (error) {
      console.error("[albion] list", error);
      return { ok: false, error: "Não consegui falar com a API do Albion agora. Tente de novo em instantes." };
    }
  });

/** Detalhe de uma batalha: placar, jogadores com equipamento e kills. */
export const fetchBattle = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ server, id: z.number().int().positive() }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; battle: BattleDetail } | { ok: false; error: string }> => {
    try {
      const { getBattle } = await import("@/lib/albion.server");
      return { ok: true, battle: await getBattle(data.server, data.id) };
    } catch (error) {
      console.error("[albion] battle", error);
      return { ok: false, error: "Não consegui carregar essa batalha agora. Confira o número e tente de novo." };
    }
  });

/** Kills da batalha, equipamento e IP dos jogadores (etapa 2, depois do placar). */
export const fetchBattleKills = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ server, id: z.number().int().positive(), totalKills: z.number().int().min(0).max(100000) }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; data: BattleKills } | { ok: false; error: string }> => {
    try {
      const { getBattleKills } = await import("@/lib/albion.server");
      return { ok: true, data: await getBattleKills(data.server, data.id, data.totalKills) };
    } catch (error) {
      console.error("[albion] kills", error);
      return { ok: false, error: "Não consegui carregar as kills agora." };
    }
  });

type Fail = { ok: false; error: string };
const failure = (label: string, error: unknown, message: string): Fail => { console.error(`[albion] ${label}`, error); return { ok: false, error: message }; };

/** Kills mais recentes (feed). */
export const fetchRecentKills = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ server }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; kills: KillSummary[] } | Fail> => {
    try { const { recentKills } = await import("@/lib/albion-kills.server"); return { ok: true, kills: await recentKills(data.server) }; }
    catch (error) { return failure("recent", error, "Não consegui falar com a API do Albion agora. Tente de novo em instantes."); }
  });

/** Busca de jogadores pelo nome. */
export const fetchPlayerSearch = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ server, query: z.string().trim().min(2).max(40) }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; players: PlayerHit[]; guilds: GuildHit[] } | Fail> => {
    try { const { searchPlayers } = await import("@/lib/albion-kills.server"); return { ok: true, ...(await searchPlayers(data.server, data.query)) }; }
    catch (error) { return failure("search", error, "A busca não respondeu agora. Tente de novo."); }
  });

/** Perfil de um jogador com as últimas kills e mortes. */
export const fetchPlayer = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ server, id: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/) }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; player: PlayerProfile } | Fail> => {
    try { const { playerProfile } = await import("@/lib/albion-kills.server"); return { ok: true, player: await playerProfile(data.server, data.id) }; }
    catch (error) { return failure("player", error, "Não consegui carregar esse jogador agora."); }
  });

/** Uma kill completa (equipamento, inventário, participantes). */
export const fetchKill = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ server, id: z.number().int().positive() }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; kill: KillDetail } | Fail> => {
    try { const { killDetail } = await import("@/lib/albion-kills.server"); return { ok: true, kill: await killDetail(data.server, data.id) }; }
    catch (error) { return failure("kill", error, "Não consegui carregar essa kill agora. Confira o número e tente de novo."); }
  });

/** Perfil de uma guilda: números gerais e membros com mais fama. */
export const fetchGuild = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ server, id: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/) }).parse(value))
  .handler(async ({ data }): Promise<{ ok: true; guild: GuildProfile } | Fail> => {
    try { const { guildProfile } = await import("@/lib/albion-kills.server"); return { ok: true, guild: await guildProfile(data.server, data.id) }; }
    catch (error) { return failure("guild", error, "Não consegui carregar essa guilda agora."); }
  });
