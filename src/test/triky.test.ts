import { describe, expect, it } from "vitest";
import { looksLikeTrikyDps, parseTrikyDpsLine, parseTrikyLoot, prettyItemId } from "@/lib/triky";
import { parseDpsPaste } from "@/lib/loot-split";

const json = JSON.stringify({
  schema_version: 2, exported_at_utc: "2026-10-25T20:00:00Z",
  entries: [
    { timestamp_utc: "2026-10-25T19:00:00Z", cluster: "X", type: "loot", loot: { looted_by: { alliance: "", guild: "G", name: "Ana" }, item: { id: "T8_SHOES_LEATHER_ROYAL", quantity: 1, average_est_market_value: 120000 }, looted_from: { name: "Mob" } } },
    { timestamp_utc: "2026-10-25T19:01:00Z", cluster: "X", type: "loot", loot: { looted_by: { name: "Ana" }, item: { id: "T8_SHOES_LEATHER_ROYAL", quantity: 2, average_est_market_value: 150000 }, looted_from: {} } },
    { timestamp_utc: "2026-10-25T19:02:00Z", cluster: "X", type: "loot", loot: { looted_by: { name: "Bia" }, item: { id: "T6_BAG", quantity: 3, average_est_market_value: 0 }, looted_from: {} } },
    { timestamp_utc: "2026-10-25T19:03:00Z", cluster: "X", type: "kill", kill: { died: "Zed", killed_by: "Ana" } },
    { type: "loot", loot: { item: { id: "", quantity: 1 } } },
  ],
});

describe("importação do loot do Triky313", () => {
  it("soma itens iguais da mesma pessoa e usa o maior preço estimado", () => {
    const r = parseTrikyLoot(json)!;
    expect(r.kills).toBe(1); expect(r.ignored).toBe(1); expect(r.entries).toBe(3);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ name: "T8 Shoes Leather Royal", quantity: 3, unit_value: 150000, looted_by: "Ana", external_id: "imp:T8_SHOES_LEATHER_ROYAL:Ana" });
    expect(r.items[1]).toMatchObject({ looted_by: "Bia", quantity: 3, unit_value: 0 });
  });
  it("lê o CSV com ponto e vírgula e usa o nome traduzido", () => {
    const csv = "timestamp_utc;looted_by__alliance;looted_by__guild;looted_by__name;item_id;item_name;quantity;looted_from__alliance;looted_from__guild;looted_from__name;died;died_player_guild;killed_by;killed_by_guild;average_est_market_value;cluster;died_player_alliance;killed_by_alliance\n"
      + "2026-10-25T19:00:00.0000000Z;;G;Ana;T8_BAG;Bolsa do Ancião;2;;;Mob;;;;;1500,5;X;;\n"
      + "2026-10-25T19:05:00Z;;;;;;;;;;Zed;G;Ana;G;;X;;\n";
    const r = parseTrikyLoot(csv)!;
    expect(r.items).toEqual([{ name: "Bolsa do Ancião", quantity: 2, unit_value: 1501, looted_by: "Ana", external_id: "imp:T8_BAG:Ana" }]);
    expect(r.kills).toBe(1);
  });
  it("rejeita arquivo que não é do programa", () => {
    expect(parseTrikyLoot("olá")).toBeNull();
    expect(parseTrikyLoot('{"a":1}')).toBeNull();
  });
  it("deixa o nome do item legível", () => { expect(prettyItemId("T4_MAIN_SWORD@2")).toBe("T4 Main Sword .2"); });
});

describe("dps copiado do programa do Triky313", () => {
  const text = "Damage Meter\n1. Ana: 12345(45.20%)|678.90 DPS\n2. Bia Silva: 9876,5(30.00%)|400.10 DPS\n3. Cai: 5.2%\nlixo";
  it("reconhece a linha completa", () => {
    expect(parseTrikyDpsLine("1. Ana: 12345(45.20%)|678.90 DPS")).toEqual({ nick: "Ana", damage: 12345, healing: 0 });
    expect(looksLikeTrikyDps(text)).toBe(true);
  });
  it("o importador do site aceita o texto copiado e o formato antigo", () => {
    const { rows, invalid } = parseDpsPaste(text + "\nDan; 1.2k; 30");
    expect(rows).toEqual([{ nick: "Ana", damage: 12345, healing: 0 }, { nick: "Bia Silva", damage: 9877, healing: 0 }, { nick: "Dan", damage: 1200, healing: 30 }]);
    expect(invalid.length).toBe(3); // cabeçalho, linha curta e "lixo"
  });
});
