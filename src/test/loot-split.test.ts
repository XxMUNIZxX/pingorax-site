import { describe, expect, it } from "vitest";
import { computeSplit, DEFAULT_SPLIT, parseDpsPaste, parseLootPaste, parseSilver, splitSummaryText, type SplitConfig, type SplitPerson } from "@/lib/loot-split";

const cfg = (patch: Partial<SplitConfig> = {}): SplitConfig => ({ ...DEFAULT_SPLIT, ...patch });
const people = (...nicks: string[]): SplitPerson[] => nicks.map((nick) => ({ nick }));
const closes = (r: ReturnType<typeof computeSplit>) => r.rows.reduce((a, x) => a + x.total, 0) + r.guildCut + r.leftover;

describe("divisão igual", () => {
  it("divide por igual e a sobra fica à parte", () => {
    const r = computeSplit(1000, people("A", "B", "C"), cfg());
    expect(r.rows.map((x) => x.total)).toEqual([333, 333, 333]);
    expect(r.leftover).toBe(1);
    expect(closes(r)).toBe(1000);
  });
  it("ignora nick repetido (sem diferenciar maiúsculas) e quem foi excluído", () => {
    const r = computeSplit(900, [{ nick: "Ana" }, { nick: "ana" }, { nick: "Bia", excluded: true }, { nick: "Caio" }], cfg());
    expect(r.rows.map((x) => x.nick)).toEqual(["Ana", "Caio"]);
    expect(r.rows.map((x) => x.total)).toEqual([450, 450]);
  });
  it("sem ninguém, tudo vira sobra", () => {
    const r = computeSplit(500, [], cfg({ guildPercent: 10 }));
    expect(r).toMatchObject({ guildCut: 50, leftover: 450 });
    expect(r.warnings.length).toBe(1);
  });
});

describe("guilda e reparo", () => {
  it("tira % e valor fixo da guilda antes de dividir", () => {
    const r = computeSplit(10_000, people("A", "B"), cfg({ guildPercent: 10, fixedCut: 500 }));
    expect(r.guildCut).toBe(1500);
    expect(r.rows.map((x) => x.total)).toEqual([4250, 4250]);
    expect(closes(r)).toBe(10_000);
  });
  it("a guilda nunca passa do total", () => {
    const r = computeSplit(100, people("A"), cfg({ guildPercent: 100, fixedCut: 999 }));
    expect(r.guildCut).toBe(100);
    expect(r.rows[0]?.total).toBe(0);
  });
  it("devolve o reparo a quem pagou e divide o resto", () => {
    const r = computeSplit(1000, [{ nick: "A", repair: 200 }, { nick: "B" }], cfg({ deductRepair: true }));
    expect(r.repairPool).toBe(200);
    expect(r.rows.map((x) => x.total)).toEqual([600, 400]);
    expect(closes(r)).toBe(1000);
  });
  it("reparo desligado é ignorado", () => {
    const r = computeSplit(1000, [{ nick: "A", repair: 200 }, { nick: "B" }], cfg());
    expect(r.rows.map((x) => x.total)).toEqual([500, 500]);
  });
  it("reparo maior que o disponível é reduzido na mesma proporção", () => {
    const r = computeSplit(100, [{ nick: "A", repair: 300 }, { nick: "B", repair: 100 }], cfg({ deductRepair: true }));
    expect(r.repairPool).toBeLessThanOrEqual(100);
    expect(r.warnings.length).toBe(1);
    expect(closes(r)).toBe(100);
  });
});

describe("pesos por função", () => {
  it("divide proporcional ao peso da função", () => {
    const r = computeSplit(1000, [{ nick: "T", role: "tank" }, { nick: "H", role: "healer" }, { nick: "D", role: "dps_melee" }], cfg({ method: "weighted", roleWeights: { tank: 2, healer: 1, dps_melee: 1 } }));
    expect(r.rows.map((x) => x.total)).toEqual([500, 250, 250]);
  });
  it("função sem peso vale 1", () => {
    const r = computeSplit(300, [{ nick: "A", role: "tank" }, { nick: "B" }], cfg({ method: "weighted", roleWeights: { tank: 2 } }));
    expect(r.rows.map((x) => x.total)).toEqual([200, 100]);
  });
});

describe("ajuste manual", () => {
  it("quem tem % manual leva a sua parte e o resto divide os demais", () => {
    const r = computeSplit(1000, [{ nick: "Caller", manualPercent: 20 }, { nick: "A" }, { nick: "B" }], cfg());
    expect(r.rows.map((x) => x.total)).toEqual([200, 400, 400]);
    expect(r.rows[0]?.manual).toBe(true);
    expect(closes(r)).toBe(1000);
  });
  it("passar de 100% reduz e avisa, sem sobrar prata negativa", () => {
    const r = computeSplit(1000, [{ nick: "A", manualPercent: 80 }, { nick: "B", manualPercent: 80 }], cfg());
    expect(r.warnings.length).toBe(1);
    expect(r.leftover).toBeGreaterThanOrEqual(0);
    expect(closes(r)).toBe(1000);
  });
});

describe("leitura de números e colagem", () => {
  it("entende separadores e sufixos", () => {
    expect(parseSilver("12.500")).toBe(12500);
    expect(parseSilver("12,500")).toBe(12500);
    expect(parseSilver("1.5k")).toBe(1500);
    expect(parseSilver("2m")).toBe(2_000_000);
    expect(parseSilver("3 500")).toBe(3500);
    expect(parseSilver("abc")).toBeNull();
  });
  it("lê itens em várias formas e separa as linhas inválidas", () => {
    const { items, invalid } = parseLootPaste("Espada T8; 2; 12.500\nBota T7 ; 800\nCapa x3 1,5k\n\nlinha ruim");
    expect(items).toEqual([
      { name: "Espada T8", quantity: 2, unit_value: 12500 },
      { name: "Bota T7", quantity: 1, unit_value: 800 },
      { name: "Capa", quantity: 3, unit_value: 1500 },
    ]);
    expect(invalid).toEqual(["linha ruim"]);
  });
  it("lê linhas de dps", () => {
    const { rows, invalid } = parseDpsPaste("Ana; 1.2m; 30k\nBia;500k\nx;1");
    expect(rows).toEqual([{ nick: "Ana", damage: 1_200_000, healing: 30_000 }, { nick: "Bia", damage: 500_000, healing: 0 }]);
    expect(invalid).toEqual(["x;1"]);
  });
});

describe("resumo para colar", () => {
  it("lista cada jogador e a sobra", () => {
    const text = splitSummaryText("ZvZ", computeSplit(1001, people("A", "B", "C"), cfg({ guildPercent: 10 })));
    expect(text).toContain("💰 Divisão do loot — ZvZ");
    expect(text).toContain("Guilda: 100");
    expect(text).toContain("• A: 300");
    expect(text).toContain("Sobra:");
  });
});
