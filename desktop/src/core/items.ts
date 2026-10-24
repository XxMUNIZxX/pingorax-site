import table from "../../data/items.json";

const items = table as unknown as Record<string, [string, string]>;

/** Nome do item pelo número que o jogo manda (índice da lista oficial de itens). */
export function itemName(index: number): { id: string; name: string } {
  const row = items[String(index)];
  return row ? { id: row[0], name: row[1] || row[0] } : { id: `ITEM_${index}`, name: `Item ${index}` };
}

/** Itens de baixo valor que o caller normalmente não quer na lista (lixo de mob). */
export function isTrash(id: string): boolean {
  return /(^|_)(TRASH|JUNK)(_|$)/.test(id) || /_TRASH_/.test(id);
}
