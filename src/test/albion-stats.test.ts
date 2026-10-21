import { describe, expect, it } from "vitest";
import { busiestHour, playerStats } from "@/lib/albion-stats";
import type { KillSide, PlayerEvent } from "@/lib/albion-types";

const side = (name: string, guild: string, weapon?: string): KillSide => ({ name, guild, alliance: "", allianceTag: "", ip: 1000, gear: weapon ? { weapon } : {} });
const ev = (kind: "kill" | "death", id: number, time: string, fame: number, assists: number, mine: KillSide, other: KillSide): PlayerEvent => ({
  id, time, fame, assists, battleId: 0, kind,
  killer: kind === "kill" ? mine : other, victim: kind === "kill" ? other : mine,
});
const me = (weapon: string) => side("Eu", "Pingoras", weapon);

const events: PlayerEvent[] = [
  ev("kill", 1, "2026-10-20T21:30:00.1234567Z", 100_000, 0, me("T8_MAIN_SWORD"), side("A", "Inimigos")),
  ev("kill", 2, "2026-10-20T21:45:00.0000000Z", 300_000, 3, me("T8_MAIN_SWORD"), side("B", "Inimigos")),
  ev("kill", 3, "2026-10-20T10:00:00.0000000Z", 50_000, 0, me("T8_2H_BOW"), side("C", "Outros")),
  ev("death", 4, "2026-10-20T21:50:00.0000000Z", 80_000, 5, me("T8_MAIN_SWORD"), side("D", "Inimigos")),
];

describe("estatísticas do jogador", () => {
  const stats = playerStats(events, -180);
  it("conta kills, mortes e K/D", () => {
    expect(stats).toMatchObject({ kills: 3, deaths: 1, kd: 3, fameGained: 450_000, fameLost: 80_000, avgKillFame: 150_000 });
  });
  it("separa kills sozinho das em grupo", () => {
    expect(stats.soloKills).toBe(2);
    expect(stats.groupKills).toBe(1);
  });
  it("acha as armas mais usadas, com kills e mortes de cada uma", () => {
    expect(stats.weapons[0]).toEqual({ code: "T8_MAIN_SWORD", uses: 3, kills: 2, deaths: 1 });
    expect(stats.weapons[1]).toEqual({ code: "T8_2H_BOW", uses: 1, kills: 1, deaths: 0 });
  });
  it("lista as guildas mais enfrentadas, de ambos os lados", () => {
    expect(stats.opponents[0]).toEqual({ guild: "Inimigos", count: 3 });
    expect(stats.opponents).toHaveLength(2);
  });
  it("acha a melhor kill e a morte mais cara", () => {
    expect(stats.bestKill?.id).toBe(2);
    expect(stats.worstDeath?.id).toBe(4);
  });
  it("atividade por hora respeita o fuso (Brasil = -180)", () => {
    expect(stats.hours[18]).toBe(3);   // 21h UTC = 18h em Brasília
    expect(stats.hours[7]).toBe(1);    // 10h UTC = 7h
    expect(busiestHour(stats.hours)).toBe(18);
    expect(playerStats(events, 0).hours[21]).toBe(3);
  });
  it("datas do jogo com 7 casas decimais são lidas", () => {
    expect(stats.from).toBe("2026-10-20T10:00:00.0000000Z");
    expect(stats.to).toBe("2026-10-20T21:50:00.0000000Z");
  });
});

describe("casos vazios", () => {
  it("sem eventos não inventa números", () => {
    expect(playerStats([])).toMatchObject({ kills: 0, deaths: 0, kd: null, avgKillFame: 0, bestKill: null, from: null });
    expect(busiestHour(new Array(24).fill(0))).toBeNull();
  });
  it("sem mortes o K/D é o número de kills", () => {
    expect(playerStats(events.slice(0, 2)).kd).toBe(2);
  });
});
