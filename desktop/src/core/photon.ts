// Decodificador do protocolo Photon (v1.6, usado pelo Albion): pega um pacote UDP e devolve as mensagens (eventos, pedidos e respostas).
// Tudo em big-endian. Pacotes que não conseguimos ler são ignorados (o jogo manda muita coisa que não nos interessa).

export type PhotonParams = Map<number, unknown>;
export type PhotonMessage =
  | { kind: "event"; code: number; params: PhotonParams }
  | { kind: "request"; code: number; params: PhotonParams }
  | { kind: "response"; code: number; returnCode: number; params: PhotonParams };

class Reader {
  private readonly view: DataView;
  pos = 0;
  /** Último parâmetro lido e os que deram certo, para explicar onde uma mensagem quebrou. */
  failKey = -1; okKeys: number[] = [];
  constructor(readonly bytes: Uint8Array) { this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  get left() { return this.bytes.length - this.pos; }
  private need(n: number) { if (n < 0 || this.pos + n > this.bytes.length) throw new RangeError("fim dos dados"); }
  u8() { this.need(1); return this.view.getUint8(this.pos++); }
  i16() { this.need(2); const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  u16() { this.need(2); const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  u32() { this.need(4); const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
  i64() { this.need(8); const v = this.view.getBigInt64(this.pos); this.pos += 8; return Number(v); }
  f32() { this.need(4); const v = this.view.getFloat32(this.pos); this.pos += 4; return v; }
  f64() { this.need(8); const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }
  take(n: number) { this.need(n); const out = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return out; }
}

const decoder = new TextDecoder("utf-8");

function readString(r: Reader): string { return decoder.decode(r.take(r.u16())); }

/** Tipos de valor do Photon (código = letra ASCII). */
function readValue(r: Reader, type: number, depth = 0): unknown {
  if (depth > 8) throw new RangeError("aninhamento demais");
  switch (type) {
    case 0: case 42: return null;
    case 98: return r.u8();                 // byte
    case 111: return r.u8() !== 0;          // bool
    case 107: case 7: return r.i16();       // short
    case 105: return r.i32();               // int
    case 108: return r.i64();               // long
    case 102: return r.f32();
    case 100: return r.f64();
    case 115: return readString(r);
    case 120: { const n = r.i32(); return r.take(n); } // byte[]
    case 99: { r.u8(); const n = r.u16(); return r.take(n); } // tipo customizado: devolve os bytes
    case 110: { const n = r.i32(); if (n < 0 || n > 100000) throw new RangeError("lista grande"); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.i32()); return a; }
    case 97: { const n = r.u16(); const a: string[] = []; for (let i = 0; i < n; i++) a.push(readString(r)); return a; }
    case 121: { const n = r.u16(); const t = r.u8(); const a: unknown[] = []; for (let i = 0; i < n; i++) a.push(readValue(r, t, depth + 1)); return a; }
    case 122: { const n = r.u16(); const a: unknown[] = []; for (let i = 0; i < n; i++) a.push(readValue(r, r.u8(), depth + 1)); return a; }
    case 104: { const n = r.u16(); const m = new Map<unknown, unknown>(); for (let i = 0; i < n; i++) { const k = readValue(r, r.u8(), depth + 1); m.set(k, readValue(r, r.u8(), depth + 1)); } return m; }
    case 68: { const kt = r.u8(); const vt = r.u8(); const n = r.u16(); const m = new Map<unknown, unknown>();
      for (let i = 0; i < n; i++) { const k = readValue(r, kt === 0 ? r.u8() : kt, depth + 1); m.set(k, readValue(r, vt === 0 ? r.u8() : vt, depth + 1)); } return m; }
    case 101: { const code = r.u8(); return { code, params: readParams(r, depth + 1) }; }
    case 113: { const code = r.u8(); return { code, params: readParams(r, depth + 1) }; }
    case 112: { const code = r.u8(); const returnCode = r.i16(); const dbgType = r.u8(); readValue(r, dbgType, depth + 1); return { code, returnCode, params: readParams(r, depth + 1) }; }
    default: throw new RangeError(`tipo desconhecido ${type}`);
  }
}

function readParams(r: Reader, depth = 0): PhotonParams {
  const n = r.u16(); const out: PhotonParams = new Map();
  for (let i = 0; i < n; i++) { const key = r.u8(); r.failKey = key; out.set(key, readValue(r, r.u8(), depth)); r.okKeys.push(key); }
  return out;
}

/** Lê uma mensagem já remontada (começa em 0xF3). Devolve null se não for evento/pedido/resposta que a gente entenda. */
export function decodeMessage(bytes: Uint8Array, stats?: ParserStats): PhotonMessage | null {
  const r = new Reader(bytes);
  if (r.left < 2) return null;
  const sig = r.u8();
  if (sig !== 0xf3) { stats?.note(`assinatura ${sig}`); stats?.sample(`assinatura ${sig}`, bytes, 0, []); return null; }
  const type = r.u8();
  if (type > 128) { if (stats) stats.encrypted++; return null; }
  try {
    if (type === 4) { const code = r.u8(); return { kind: "event", code, params: readParams(r) }; }
    if (type === 2) { const code = r.u8(); return { kind: "request", code, params: readParams(r) }; }
    if (type === 3 || type === 7) { const code = r.u8(); const returnCode = r.i16(); readValue(r, r.u8()); return { kind: "response", code, returnCode, params: readParams(r) }; }
    stats?.note(`mensagem tipo ${type}`);
  } catch (e) {
    const why = e instanceof Error ? e.message : "erro";
    stats?.note(`tipo ${type}: ${why.replace(/\d+/g, "N")}`);
    stats?.sample(`tipo ${type}: ${why}; falhou no parâmetro ${r.failKey}`, bytes, r.pos, r.okKeys);
    return null;
  }
  return null;
}

/** Contadores de cada etapa, para o diagnóstico mostrar onde a leitura trava. */
export class ParserStats {
  packets = 0; commands: Record<number, number> = {}; decoded = 0; encrypted = 0;
  errors = new Map<string, number>();
  samples: { reason: string; at: number; okKeys: number[]; hex: string }[] = [];
  note(reason: string) { this.errors.set(reason, (this.errors.get(reason) ?? 0) + 1); if (this.errors.size > 40) this.errors.delete(this.errors.keys().next().value as string); }
  /** Guarda alguns exemplos de mensagens que não deu para ler (bytes em hexadecimal) para eu analisar. */
  sample(reason: string, bytes: Uint8Array, at: number, okKeys: number[]) {
    const cls = reason.replace(/\d+/g, "N").split(";")[0]!;
    if (this.samples.length >= 24 || this.samples.filter((s) => s.reason.replace(/\d+/g, "N").split(";")[0] === cls).length >= 3) return;
    this.samples.push({ reason, at, okKeys: [...okKeys], hex: Array.from(bytes.subarray(0, 220), (b) => b.toString(16).padStart(2, "0")).join("") });
  }
  summary() {
    return { packets: this.packets, decoded: this.decoded, encrypted: this.encrypted, commands: this.commands,
      errors: [...this.errors].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, count]) => ({ reason, count })) };
  }
}

type Fragment = { total: number; got: number; data: Uint8Array; seen: Set<number> };

/** Decodifica pacotes UDP um a um, remontando mensagens grandes que vêm em pedaços. */
export class PhotonParser {
  private readonly fragments = new Map<number, Fragment>();
  readonly stats = new ParserStats();

  /** Recebe o conteúdo do pacote UDP (sem os cabeçalhos de rede). */
  feed(packet: Uint8Array): PhotonMessage[] {
    const out: PhotonMessage[] = [];
    try {
      const r = new Reader(packet);
      if (r.left < 12) return out;
      this.stats.packets++;
      // Cabeçalho: peerId(2), crc ligado(1; 0 ou 1, NÃO indica criptografia), quantidade de comandos(1), tempo(4), desafio(4).
      r.u16(); r.u8(); const commands = r.u8(); r.u32(); r.i32();
      for (let c = 0; c < commands && r.left >= 12; c++) {
        const type = r.u8(); r.u8(); r.u8(); r.u8(); const length = r.i32(); r.i32();
        const size = length - 12;
        this.stats.commands[type] = (this.stats.commands[type] ?? 0) + 1;
        if (size < 0 || size > r.left) { this.stats.note("comando malformado"); break; }
        let body = r.take(size);
        if (type === 7) { if (body.length < 4) continue; body = body.subarray(4); }
        if (type === 6 || type === 7) { const m = decodeMessage(body, this.stats); if (m) { out.push(m); this.stats.decoded++; } }
        else if (type === 8) { const whole = this.addFragment(body); if (whole) { const m = decodeMessage(whole, this.stats); if (m) { out.push(m); this.stats.decoded++; } } }
      }
    } catch { /* pacote estranho: ignora */ }
    return out;
  }

  private addFragment(body: Uint8Array): Uint8Array | null {
    if (body.length < 20) return null;
    const r = new Reader(body);
    const start = r.i32(); r.i32(); const num = r.i32(); const total = r.i32(); const offset = r.i32();
    const data = r.take(r.left);
    if (total <= 0 || total > 4_000_000 || offset < 0 || offset + data.length > total) return null;
    let f = this.fragments.get(start);
    if (!f) {
      if (this.fragments.size > 50) this.fragments.delete(this.fragments.keys().next().value as number);
      f = { total, got: 0, data: new Uint8Array(total), seen: new Set() }; this.fragments.set(start, f);
    }
    if (f.seen.has(num)) return null;
    f.seen.add(num); f.data.set(data, offset); f.got += data.length;
    if (f.got >= f.total) { this.fragments.delete(start); return f.data; }
    return null;
  }
}
