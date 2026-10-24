import raw from "../../data/event-codes.json";

/** Códigos de evento (parâmetro 252). Podem ser trocados em tempo de execução quando o jogo atualiza (veja applyCodes). */
export type Codes = {
  leave: number; joinFinished: number; newCharacter: number; healthUpdate: number; otherGrabbedLoot: number;
  takeSilver: number; partyJoined: number; partyDisbanded: number; partyPlayerJoined: number; partyPlayerLeft: number;
  joinOperation: number;
};

const e = raw.events as Record<string, number>;
export const DEFAULT_CODES: Codes = {
  leave: e["Leave"]!, joinFinished: e["JoinFinished"]!, newCharacter: e["NewCharacter"]!, healthUpdate: e["HealthUpdate"]!,
  otherGrabbedLoot: e["OtherGrabbedLoot"]!, takeSilver: e["TakeSilver"]!, partyJoined: e["PartyJoined"]!, partyDisbanded: e["PartyDisbanded"]!,
  partyPlayerJoined: e["PartyPlayerJoined"]!, partyPlayerLeft: e["PartyPlayerLeft"]!,
  joinOperation: 2,
};

/** Mescla uma tabela baixada (parcial) por cima da padrão, ignorando valores que não sejam inteiros pequenos. */
export function applyCodes(base: Codes, override: unknown): Codes {
  if (!override || typeof override !== "object") return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (k in out && typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 2000) (out as Record<string, number>)[k] = v;
  }
  return out;
}
