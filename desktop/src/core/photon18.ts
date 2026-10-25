// Protocolo de valores "1.8" do Photon (GpBinaryV18), usado pelo Albion atual. Pequenos inteiros e tamanhos vêm comprimidos (varint),
// short/float/double em little-endian, e vários tipos têm código próprio para "zero" ou "verdadeiro/falso".
import type { PhotonMessage, PhotonParams } from "./photon";

export class Fail extends Error {
  constructor(message: string, readonly key: number, readonly pos: number, readonly okKeys: number[]) { super(message); }
}

class R {
  pos = 0; failKey = -1; okKeys: number[] = [];
  private readonly view: DataView;
  constructor(readonly b: Uint8Array) { this.view = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  need(n: number) { if (n < 0 || this.pos + n > this.b.length) throw new RangeError("fim dos dados"); }
  u8() { this.need(1); return this.b[this.pos++]!; }
  u16() { this.need(2); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i16() { this.need(2); const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  f32() { this.need(4); const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  f64() { this.need(8); const v = this.view.getFloat64(this.pos, true); this.pos += 8; return v; }
  take(n: number) { this.need(n); const o = this.b.subarray(this.pos, this.pos + n); this.pos += n; return o; }
  /** Inteiro sem sinal comprimido (7 bits por byte, bit 0x80 = tem mais). */
  uvar(): number { let v = 0, mul = 1; for (let i = 0; i < 10; i++) { const x = this.u8(); v += (x & 0x7f) * mul; if (!(x & 0x80)) return v; mul *= 128; } throw new RangeError("número comprimido inválido"); }
  uvarBig(): bigint { let v = 0n, shift = 0n; for (let i = 0; i < 10; i++) { const x = this.u8(); v |= BigInt(x & 0x7f) << shift; if (!(x & 0x80)) return v; shift += 7n; } throw new RangeError("número comprimido inválido"); }
  /** Zigzag: 0,-1,1,-2,2... */
  ivar(): number { const v = this.uvarBig(); return Number((v >> 1n) ^ -(v & 1n)); }
}

const MAX_ITEMS = 100000;
const dec = new TextDecoder("utf-8");
const count = (r: R) => { const n = r.uvar(); if (n > MAX_ITEMS) throw new RangeError("lista grande"); return n; };
const str = (r: R) => dec.decode(r.take(count(r)));

function readValue(r: R, t: number, depth = 0): unknown {
  if (depth > 8) throw new RangeError("aninhamento demais");
  switch (t) {
    case 0: case 8: return null;
    case 2: return r.u8() !== 0;
    case 3: return r.u8();
    case 4: return r.i16();
    case 5: return r.f32();
    case 6: return r.f64();
    case 7: return str(r);
    case 9: return r.ivar();
    case 10: return r.ivar();
    case 11: return r.u8();
    case 12: return -r.u8();
    case 13: return r.u16();
    case 14: return -r.u16();
    case 15: return r.u8();
    case 16: return -r.u8();
    case 17: return r.u16();
    case 18: return -r.u16();
    case 19: { r.u8(); return r.take(count(r)); }
    case 20: { const kt = r.u8(); const vt = r.u8(); const n = count(r); const m = new Map<unknown, unknown>();
      for (let i = 0; i < n; i++) { const k = readValue(r, kt === 0 ? r.u8() : kt, depth + 1); m.set(k, readValue(r, vt === 0 ? r.u8() : vt, depth + 1)); } return m; }
    case 21: { const n = count(r); const m = new Map<unknown, unknown>(); for (let i = 0; i < n; i++) { const k = readValue(r, r.u8(), depth + 1); m.set(k, readValue(r, r.u8(), depth + 1)); } return m; }
    case 23: { const n = count(r); const a: unknown[] = []; for (let i = 0; i < n; i++) a.push(readValue(r, r.u8(), depth + 1)); return a; }
    case 24: case 26: { const code = r.u8(); return { code, params: readParams(r, depth + 1) }; }
    case 25: { const code = r.u8(); const returnCode = r.i16(); readValue(r, r.u8(), depth + 1); return { code, returnCode, params: readParams(r, depth + 1) }; }
    case 27: return false;
    case 28: return true;
    case 29: case 30: case 31: case 32: case 33: case 34: return 0;
    case 64: { const n = count(r); const et = r.u8(); const a: unknown[] = []; for (let i = 0; i < n; i++) a.push(readValue(r, et, depth + 1)); return a; }
    case 66: { const n = count(r); const a: boolean[] = []; let byte = 0; for (let i = 0; i < n; i++) { if (i % 8 === 0) byte = r.u8(); a.push((byte & (1 << (i % 8))) !== 0); } return a; }
    case 67: return r.take(count(r));
    case 68: { const n = count(r); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.i16()); return a; }
    case 69: { const n = count(r); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.f32()); return a; }
    case 70: { const n = count(r); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.f64()); return a; }
    case 71: { const n = count(r); const a: string[] = []; for (let i = 0; i < n; i++) a.push(str(r)); return a; }
    case 73: case 74: { const n = count(r); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.ivar()); return a; }
    case 83: { r.u8(); const n = count(r); const a: Uint8Array[] = []; for (let i = 0; i < n; i++) a.push(r.take(count(r))); return a; }
    case 84: { const kt = r.u8(); const vt = r.u8(); const n = count(r); const a: unknown[] = []; for (let i = 0; i < n; i++) { const m = new Map<unknown, unknown>(); const sz = count(r);
      for (let j = 0; j < sz; j++) { const k = readValue(r, kt === 0 ? r.u8() : kt, depth + 1); m.set(k, readValue(r, vt === 0 ? r.u8() : vt, depth + 1)); } a.push(m); } return a; }
    case 85: { const n = count(r); const a: unknown[] = []; for (let i = 0; i < n; i++) a.push(readValue(r, 21, depth + 1)); return a; }
    default:
      if (t >= 0x80) return r.take(count(r)); // tipo customizado "slim": o código do tipo vem no próprio byte
      throw new RangeError(`tipo desconhecido ${t}`);
  }
}

function readParams(r: R, depth = 0): PhotonParams {
  const n = r.u8(); const out: PhotonParams = new Map();
  for (let i = 0; i < n; i++) { const key = r.u8(); r.failKey = key; out.set(key, readValue(r, r.u8(), depth)); r.okKeys.push(key); }
  return out;
}

/** Lê uma mensagem (já sem criptografia, começando em 0xF3 + tipo) no formato 1.8. Lança Fail se não bater. */
export function decodeMessage18(bytes: Uint8Array): PhotonMessage | null {
  const r = new R(bytes);
  try {
    r.u8(); const type = r.u8();
    let msg: PhotonMessage;
    if (type === 4) { const code = r.u8(); msg = { kind: "event", code, params: readParams(r) }; }
    else if (type === 2) { const code = r.u8(); msg = { kind: "request", code, params: readParams(r) }; }
    else if (type === 3 || type === 7) { const code = r.u8(); const returnCode = r.i16(); readValue(r, r.u8()); msg = { kind: "response", code, returnCode, params: readParams(r) }; }
    else return null;
    // Uma leitura certa gasta a mensagem inteira. Sobra de bytes = formato errado (evita "entender" lixo do formato antigo).
    if (r.pos !== bytes.length) throw new RangeError("sobraram bytes");
    return msg;
  } catch (e) { throw new Fail(e instanceof Error ? e.message : "erro", r.failKey, r.pos, r.okKeys); }
}
