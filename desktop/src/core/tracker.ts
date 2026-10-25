import type { PhotonMessage } from "./photon";
import { DEFAULT_CODES, type Codes } from "./codes";
import { itemName } from "./items";

export type DpsRow = { nick: string; damage: number; healing: number };
export type LootRow = { id: string; name: string; quantity: number; looter: string; from: string; externalId: string };
export type Snapshot = { me: string | null; party: string[]; silver: number; dps: DpsRow[]; loot: LootRow[] };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Código "de verdade" da mensagem: o Albion manda eventos com código 252 e respostas com código 253 dentro dos parâmetros. */
export function gameCode(m: PhotonMessage): number {
  if (m.kind === "event") return num(m.params.get(252)) ?? m.code;
  if (m.kind === "response") return num(m.params.get(253)) ?? m.code;
  return num(m.params.get(253)) ?? m.code;
}

/** Acompanha o que acontece no jogo (quem é quem, dano, cura, loot) a partir das mensagens já decodificadas. */
export class Tracker {
  private names = new Map<number, string>();
  private me: string | null = null;
  private meId: number | null = null;
  private party = new Set<string>();
  private dmg = new Map<string, { damage: number; healing: number }>();
  private loot: LootRow[] = [];
  private silverRaw = 0;
  private seq = 0;
  private readonly session = Date.now().toString(36);

  constructor(private codes: Codes = DEFAULT_CODES, private readonly onChange?: () => void) {}

  setCodes(codes: Codes) { this.codes = codes; }

  /** Zera dano e loot (nova luta ou nova sessão). Mantém quem é quem. */
  reset() { this.dmg.clear(); this.loot = []; this.silverRaw = 0; this.onChange?.(); }

  handle(m: PhotonMessage): void {
    const c = this.codes; const code = gameCode(m); const p = m.params;
    if (m.kind === "response") {
      // A resposta de "entrou no mapa" traz o seu objeto (0), um GUID de 16 bytes (1) e o seu nome (2). Reconhece pelo código ou pelo formato.
      const guid = p.get(1);
      const looksLikeJoin = guid instanceof Uint8Array && guid.length === 16 && typeof p.get(2) === "string" && num(p.get(0)) !== null && p.size >= 12;
      if (code === c.joinOperation || looksLikeJoin) {
        const name = str(p.get(2)); const id = num(p.get(0));
        if (name) { this.me = name; this.meId = id; if (id !== null) this.names.set(id, name); this.onChange?.(); }
      }
      return;
    }
    if (m.kind !== "event") return;
    if (code === c.newCharacter) {
      const id = num(p.get(0)); const name = str(p.get(1));
      if (id !== null && name) this.names.set(id, name);
    } else if (code === c.healthUpdate) {
      this.health(p);
    } else if (code === c.otherGrabbedLoot) {
      this.grabbed(p);
    } else if (code === c.partyJoined) {
      const list = p.get(5);
      this.party = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
      this.onChange?.();
    } else if (code === c.partyPlayerJoined) {
      const name = str(p.get(2)); if (name) { this.party.add(name); this.onChange?.(); }
    } else if (code === c.partyDisbanded) { this.party.clear(); this.onChange?.(); }
  }

  private health(p: Map<number, unknown>) {
    const target = num(p.get(0)); const change = num(p.get(2)); const causer = num(p.get(6));
    if (target === null || change === null || causer === null || change === 0) return;
    const nick = this.names.get(causer); if (!nick) return;
    const row = this.dmg.get(nick) ?? { damage: 0, healing: 0 };
    if (change < 0) { if (causer === target) return; row.damage += -change; } else row.healing += change;
    this.dmg.set(nick, row); this.onChange?.();
  }

  private grabbed(p: Map<number, unknown>) {
    const looter = str(p.get(2)); const quantity = num(p.get(5)) ?? 1; if (!looter || quantity <= 0) return;
    if (p.get(3) === true) { this.silverRaw += quantity; this.onChange?.(); return; }
    const index = num(p.get(4)); if (index === null) return;
    const item = itemName(index); const from = str(p.get(1)) ?? "?";
    this.loot.push({ id: item.id, name: item.name, quantity, looter, from, externalId: `${this.session}-${++this.seq}` });
    this.onChange?.();
  }

  /** O jogo manda prata em décimos de milésimo (1 prata = 10000). */
  snapshot(onlyParty = true): Snapshot {
    const inParty = (n: string) => !onlyParty || this.party.size === 0 || this.party.has(n);
    const dps = [...this.dmg].filter(([n]) => inParty(n)).map(([nick, v]) => ({ nick, damage: Math.round(v.damage), healing: Math.round(v.healing) }))
      .sort((a, b) => b.damage - a.damage);
    return { me: this.me, party: [...this.party], silver: Math.floor(this.silverRaw / 10000), dps, loot: this.loot.filter((l) => inParty(l.looter)) };
  }
}
