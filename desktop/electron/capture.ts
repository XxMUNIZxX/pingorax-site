// Captura os pacotes UDP do Albion (portas 5055/5056/5058) usando o Npcap. O Npcap precisa estar instalado no Windows.
import { createRequire } from "node:module";

type CapModule = {
  Cap: new () => { open(device: string, filter: string, bufSize: number, buffer: Buffer): string; on(ev: "packet", cb: (nbytes: number) => void): void; close(): void };
  decoders: { PROTOCOL: { ETHERNET: { IPV4: number }; IP: { UDP: number } }; Ethernet(b: Buffer): { info: { type: number }; offset: number }; IPV4(b: Buffer, o: number): { info: { protocol: number }; offset: number }; UDP(b: Buffer, o: number): { info: { length: number }; offset: number } };
};
type Device = { name: string; addresses: { addr?: string }[] };

export type CaptureStatus = { running: boolean; devices: number; error?: string };

export class Capture {
  private caps: { close(): void }[] = [];
  constructor(private readonly onPacket: (payload: Uint8Array) => void) {}

  start(): CaptureStatus {
    this.stop();
    let mod: CapModule & { Cap: { deviceList(): Device[] } };
    try { mod = createRequire(__filename)("cap"); }
    catch { return { running: false, devices: 0, error: "Não consegui carregar a captura de rede. Instale o Npcap (npcap.com) e abra o app de novo." }; }
    let list: Device[] = [];
    try { list = (mod.Cap as unknown as { deviceList(): Device[] }).deviceList(); }
    catch { return { running: false, devices: 0, error: "Npcap não encontrado. Instale o Npcap com a opção de compatibilidade com WinPcap." }; }
    const { decoders } = mod; const { PROTOCOL } = decoders;
    for (const dev of list) {
      if (!dev.addresses?.some((a) => a.addr && /^\d+\.\d+\.\d+\.\d+$/.test(a.addr) && !a.addr.startsWith("127."))) continue;
      try {
        const buffer = Buffer.alloc(65535);
        const cap = new mod.Cap();
        const linkType = cap.open(dev.name, "udp and (port 5055 or port 5056 or port 5058)", 10 * 1024 * 1024, buffer);
        if (linkType !== "ETHERNET") { cap.close(); continue; }
        cap.on("packet", (nbytes: number) => {
          try {
            const eth = decoders.Ethernet(buffer);
            if (eth.info.type !== PROTOCOL.ETHERNET.IPV4) return;
            const ip = decoders.IPV4(buffer, eth.offset);
            if (ip.info.protocol !== PROTOCOL.IP.UDP) return;
            const udp = decoders.UDP(buffer, ip.offset);
            const end = Math.min(nbytes, udp.offset + udp.info.length - 8);
            if (end > udp.offset) this.onPacket(Uint8Array.from(buffer.subarray(udp.offset, end)));
          } catch { /* pacote estranho */ }
        });
        this.caps.push(cap);
      } catch { /* placa que não dá para abrir: segue */ }
    }
    return this.caps.length ? { running: true, devices: this.caps.length } : { running: false, devices: 0, error: "Nenhuma placa de rede pôde ser aberta. Rode o app como administrador ou reinstale o Npcap." };
  }

  stop() { for (const c of this.caps) { try { c.close(); } catch { /* já fechada */ } } this.caps = []; }
}
