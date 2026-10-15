import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BattleDetail, BattleListItem } from "@/lib/albion-types";

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
