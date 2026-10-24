// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PhotonParser, decodeMessage } from "../src/core/photon";
import { Tracker, gameCode } from "../src/core/tracker";
import { DEFAULT_CODES, applyCodes } from "../src/core/codes";
import { itemName } from "../src/core/items";
import { sendSnapshot } from "../src/core/uploader";

// --- utilitários para montar pacotes Photon de teste ---
const be = (n: number, bytes: number) => { const a = new Uint8Array(bytes); let v = BigInt(n); for (let i = bytes - 1; i >= 0; i--) { a[i] = Number(v & 0xffn); v >>= 8n; } return a; };
const cat = (...p: Uint8Array[]) => { const out = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of p) { out.set(x, o); o += x.length; } return out; };
const str = (s: string) => { const b = new TextEncoder().encode(s); return cat(be(b.length, 2), b); };
type V = { t: "b" | "o" | "k" | "i" | "l" | "s" | "y-str"; v: number | boolean | string | string[] };
function val(x: V): Uint8Array {
  switch (x.t) {
    case "b": return cat(Uint8Array.of(98), be(x.v as number, 1));
    case "o": return Uint8Array.of(111, x.v ? 1 : 0);
    case "k": return cat(Uint8Array.of(107), be((x.v as number) & 0xffff, 2));
    case "i": return cat(Uint8Array.of(105), be((x.v as number) >>> 0, 4));
    case "l": return cat(Uint8Array.of(108), be(x.v as number, 8));
    case "s": return cat(Uint8Array.of(115), str(x.v as string));
    case "y-str": { const l = x.v as string[]; return cat(Uint8Array.of(97), be(l.length, 2), ...l.map(str)); }
  }
}
const f32 = (n: number) => { const a = new Uint8Array(4); new DataView(a.buffer).setFloat32(0, n); return cat(Uint8Array.of(102), a); };
function message(type: 2 | 3 | 4, code: number, params: [number, Uint8Array][], extra: Uint8Array = new Uint8Array()) {
  return cat(Uint8Array.of(0xf3, type, code), extra, be(params.length, 2), ...params.map(([k, v]) => cat(Uint8Array.of(k), v)));
}
const event = (code: number, params: [number, Uint8Array][]) => message(4, 1, [...params, [252, val({ t: "k", v: code })]]);
function packet(...commands: Uint8Array[]) {
  const header = cat(be(0, 2), Uint8Array.of(0, commands.length), be(0, 4), be(0, 4));
  return cat(header, ...commands.map((body, i) => cat(Uint8Array.of(6, 0, 0, 0), be(body.length + 12, 4), be(i + 1, 4), body)));
}

const C = DEFAULT_CODES;

describe("decodificador Photon", () => {
  it("lê um evento com vários tipos de valor", () => {
    const [m] = new PhotonParser().feed(packet(event(C.newCharacter, [[0, val({ t: "i", v: 4195 })], [1, val({ t: "s", v: "Nick Teste" })], [2, f32(1.5)], [3, val({ t: "o", v: true })], [4, val({ t: "y-str", v: ["a", "b"] })]])));
    expect(m?.kind).toBe("event");
    expect(gameCode(m!)).toBe(C.newCharacter);
    expect(m!.params.get(1)).toBe("Nick Teste");
    expect(m!.params.get(2)).toBe(1.5);
    expect(m!.params.get(3)).toBe(true);
    expect(m!.params.get(4)).toEqual(["a", "b"]);
  });
  it("remonta mensagem em pedaços", () => {
    const whole = event(C.newCharacter, [[0, val({ t: "i", v: 7 })], [1, val({ t: "s", v: "Fragmentado" })]]);
    const a = whole.subarray(0, 10); const b = whole.subarray(10);
    const frag = (part: Uint8Array, num: number, offset: number) => cat(be(55, 4), be(2, 4), be(num, 4), be(whole.length, 4), be(offset, 4), part);
    const mk = (body: Uint8Array) => cat(be(0, 2), Uint8Array.of(0, 1), be(0, 4), be(0, 4), Uint8Array.of(8, 0, 0, 0), be(body.length + 12, 4), be(1, 4), body);
    const parser = new PhotonParser();
    expect(parser.feed(mk(frag(a, 0, 0)))).toHaveLength(0);
    const out = parser.feed(mk(frag(b, 1, 10)));
    expect(out).toHaveLength(1);
    expect(out[0]!.params.get(1)).toBe("Fragmentado");
  });
  it("ignora lixo e pacotes criptografados sem quebrar", () => {
    const p = new PhotonParser();
    expect(p.feed(new Uint8Array([1, 2, 3]))).toEqual([]);
    expect(p.feed(cat(be(0, 2), Uint8Array.of(1, 1), be(0, 4), be(0, 4), new Uint8Array(30)))).toEqual([]);
    expect(decodeMessage(Uint8Array.of(0xf3, 4, 1, 0xff, 0xff))).toBeNull();
  });
});

describe("contador de dano e loot", () => {
  const join = (name: string, id: number) => message(3, 2, [[0, val({ t: "i", v: id })], [2, val({ t: "s", v: name })], [253, val({ t: "k", v: C.joinOperation })]], Uint8Array.of(...be(0, 2), 42));
  const newChar = (id: number, name: string) => event(C.newCharacter, [[0, val({ t: "i", v: id })], [1, val({ t: "s", v: name })]]);
  const hit = (target: number, change: number, causer: number) => event(C.healthUpdate, [[0, val({ t: "i", v: target })], [2, f32(change)], [6, val({ t: "i", v: causer })]]);
  const feed = (t: Tracker, ...bodies: Uint8Array[]) => { for (const b of bodies) for (const m of new PhotonParser().feed(packet(b))) t.handle(m); };

  it("soma dano e cura por jogador e ignora dano em si mesmo", () => {
    const t = new Tracker();
    feed(t, join("Caller", 1), newChar(2, "Aluno"), newChar(900, "Mob"),
      hit(900, -100, 1), hit(900, -50.4, 1), hit(900, -30, 2), hit(2, 40, 1), hit(1, -999, 1), hit(900, -10, 5555));
    const s = t.snapshot();
    expect(s.me).toBe("Caller");
    expect(s.dps).toEqual([{ nick: "Caller", damage: 150, healing: 40 }, { nick: "Aluno", damage: 30, healing: 0 }]);
  });
  it("só conta quem está no grupo quando há grupo", () => {
    const t = new Tracker();
    feed(t, newChar(1, "Dentro"), newChar(2, "Fora"), hit(9, -10, 1), hit(9, -20, 2),
      message(4, 1, [[5, val({ t: "y-str", v: ["Dentro"] })], [252, val({ t: "k", v: C.partyJoined })]]));
    expect(t.snapshot().dps.map((d) => d.nick)).toEqual(["Dentro"]);
    expect(t.snapshot(false).dps).toHaveLength(2);
  });
  it("registra loot e prata", () => {
    const t = new Tracker();
    const loot = (looter: string, item: number, qty: number, silver = false) => event(C.otherGrabbedLoot, [[1, val({ t: "s", v: "Corpo" })], [2, val({ t: "s", v: looter })], [3, val({ t: "o", v: silver })], [4, val({ t: "i", v: item })], [5, val({ t: "i", v: qty })]]);
    feed(t, loot("Fulano", 2, 3), loot("Fulano", 0, 15501150, true), loot("Fulano", 0, 10000, true));
    const s = t.snapshot();
    expect(s.loot).toHaveLength(1);
    expect(s.loot[0]).toMatchObject({ id: "T3_2H_TOOL_TRACKING", quantity: 3, looter: "Fulano" });
    expect(s.silver).toBe(1551);
    expect(new Set(s.loot.map((l) => l.externalId)).size).toBe(1);
  });
  it("reset zera dano e loot", () => {
    const t = new Tracker(); feed(t, newChar(1, "A"), hit(9, -10, 1));
    t.reset(); expect(t.snapshot().dps).toEqual([]);
  });
});

describe("tabelas", () => {
  it("nomes de item", () => { expect(itemName(2).name).toContain("Tracking"); expect(itemName(99999999).name).toBe("Item 99999999"); });
  it("applyCodes aceita só inteiros válidos", () => {
    const c = applyCodes(C, { healthUpdate: 9, otherGrabbedLoot: "x", inexistente: 1, takeSilver: -4 });
    expect(c.healthUpdate).toBe(9); expect(c.otherGrabbedLoot).toBe(C.otherGrabbedLoot); expect(c.takeSilver).toBe(C.takeSilver);
  });
});

describe("envio ao site", () => {
  const snap = { me: null, party: [], silver: 10, dps: [{ nick: "Aluno", damage: 5, healing: 0 }, { nick: "X", damage: 1, healing: 0 }], loot: [
    { id: "A", name: "Item A", quantity: 2, looter: "Aluno", from: "m", externalId: "s-1" }, { id: "B", name: "Item B", quantity: 1, looter: "Aluno", from: "m", externalId: "s-2" }] };
  it("manda só os itens novos e devolve os ids aceitos", async () => {
    let seen: { headers: Record<string, string>; body: { items: { external_id: string }[]; dps: unknown[] } } | null = null;
    const fetchFn = (async (_u: string, init: RequestInit) => { seen = { headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) }; return new Response(JSON.stringify({ ok: true, items_added: 1, dps_upserted: 1 })); }) as unknown as typeof fetch;
    const r = await sendSnapshot("plx_abc", "11111111-1111-4111-8111-111111111111", snap, new Set(["s-1"]), { fetchFn });
    expect(r).toMatchObject({ ok: true, sent: ["s-2"] });
    expect(seen!.headers["Authorization"]).toBe("Bearer plx_abc");
    expect(seen!.body.items.map((i) => i.external_id)).toEqual(["s-2"]);
    expect(seen!.body.dps).toHaveLength(1); // "X" tem 1 letra: o site exige 2+
  });
  it("mostra o erro do servidor e a falta de internet", async () => {
    const bad = (async () => new Response(JSON.stringify({ ok: false, error: "Token inválido." }), { status: 401 })) as unknown as typeof fetch;
    expect(await sendSnapshot("t", "e", snap, new Set(), { fetchFn: bad })).toEqual({ ok: false, error: "Token inválido." });
    const off = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect((await sendSnapshot("t", "e", snap, new Set(), { fetchFn: off })).ok).toBe(false);
  });
});
