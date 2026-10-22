/** Divisão do loot: tudo em prata inteira, e a conta sempre fecha (total = guilda + reparos + jogadores + sobra). */

export type SplitConfig = {
  /** "equal": todos iguais. "weighted": cada função tem um peso. */
  method: "equal" | "weighted";
  /** Parte da guilda, em % do total (0 a 100). */
  guildPercent: number;
  /** Parte fixa da guilda, em prata, tirada além da porcentagem. */
  fixedCut: number;
  /** Devolve o reparo a quem pagou, antes de dividir o resto. */
  deductRepair: boolean;
  /** Peso por função (id de WEAPON_ROLES); função sem peso vale 1. */
  roleWeights: Record<string, number>;
};

export const DEFAULT_SPLIT: SplitConfig = { method: "equal", guildPercent: 0, fixedCut: 0, deductRepair: false, roleWeights: {} };

export type SplitPerson = {
  nick: string;
  role?: string | null | undefined;
  /** Prata de reparo que a pessoa pagou. */
  repair?: number | undefined;
  /** Se definido, a pessoa leva esta % do que sobra (depois da guilda e do reparo), em vez da divisão normal. */
  manualPercent?: number | null | undefined;
  excluded?: boolean | undefined;
};

export type SplitRow = { nick: string; weight: number; share: number; repairRefund: number; total: number; manual: boolean };
export type SplitResult = { gross: number; guildCut: number; repairPool: number; net: number; rows: SplitRow[]; leftover: number; warnings: string[] };

const int = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

export function computeSplit(total: number, people: SplitPerson[], config: SplitConfig): SplitResult {
  const warnings: string[] = [];
  const gross = int(total);
  const pct = Math.min(100, Math.max(0, Number.isFinite(config.guildPercent) ? config.guildPercent : 0));
  const guildCut = Math.min(gross, int((gross * pct) / 100) + int(config.fixedCut));

  // Sem repetir o mesmo nick (sem diferenciar maiúsculas) e sem quem foi tirado da divisão.
  const seen = new Set<string>();
  const active = people.filter((p) => {
    const key = p.nick.trim().toLowerCase();
    if (p.excluded || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Reparo: só devolve se ligado; se passar do que sobrou depois da guilda, reduz na mesma proporção.
  const available = gross - guildCut;
  const wanted = config.deductRepair ? active.map((p) => int(p.repair ?? 0)) : active.map(() => 0);
  const wantedSum = wanted.reduce((a, b) => a + b, 0);
  const factor = wantedSum > available && wantedSum > 0 ? available / wantedSum : 1;
  if (factor < 1) warnings.push("O reparo passou do que sobrou depois da guilda e foi reduzido na mesma proporção.");
  const refunds = wanted.map((r) => int(r * factor));
  const repairPool = refunds.reduce((a, b) => a + b, 0);
  const net = available - repairPool;

  // Quem tem % manual leva a sua parte primeiro; o resto é dividido entre os demais.
  let manualPercentSum = active.reduce((sum, p) => sum + (p.manualPercent != null ? Math.max(0, p.manualPercent) : 0), 0);
  const manualScale = manualPercentSum > 100 ? 100 / manualPercentSum : 1;
  if (manualPercentSum > 100) { warnings.push("As porcentagens manuais passaram de 100% e foram reduzidas."); manualPercentSum = 100; }
  const manualShares = active.map((p) => (p.manualPercent != null ? int((net * Math.max(0, p.manualPercent) * manualScale) / 100) : 0));
  const rest = net - manualShares.reduce((a, b) => a + b, 0);

  const weightOf = (p: SplitPerson) => (config.method === "weighted" ? Math.max(0, config.roleWeights[p.role ?? ""] ?? 1) : 1);
  const weights = active.map((p) => (p.manualPercent != null ? 0 : weightOf(p)));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (active.length === 0) warnings.push("Ninguém na divisão: o que sobrou fica como sobra.");

  const restShares = weights.map((w) => (weightSum > 0 ? Math.floor((rest * w) / weightSum) : 0));
  const rows: SplitRow[] = active.map((p, i) => {
    const share = (p.manualPercent != null ? manualShares[i]! : restShares[i]!);
    return { nick: p.nick.trim(), weight: weights[i]!, share, repairRefund: refunds[i]!, total: share + refunds[i]!, manual: p.manualPercent != null };
  });
  const distributed = rows.reduce((a, r) => a + r.share, 0);
  return { gross, guildCut, repairPool, net, rows, leftover: net - distributed, warnings };
}

/** "12.500", "12,500", "1.5k", "2m", "3 500" → prata inteira; null se não for número. */
export function parseSilver(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d+(?:[.,]\d+)*)([km])?$/.exec(t);
  if (!m) return null;
  if (m[2]) {
    const value = Number(m[1]!.replace(",", "."));
    return Number.isFinite(value) ? Math.floor(value * (m[2] === "k" ? 1_000 : 1_000_000)) : null;
  }
  return Number(m[1]!.replace(/[.,]/g, ""));
}

export type PastedItem = { name: string; quantity: number; unit_value: number };

/**
 * Lê linhas coladas: "Nome; quantidade; valor de cada" ou "Nome; valor" (quantidade 1). Aceita ; tab ou | como separador,
 * ou "Nome x3 12.500". Linhas que não deram para ler voltam em `invalid`.
 */
export function parseLootPaste(text: string): { items: PastedItem[]; invalid: string[] } {
  const items: PastedItem[] = []; const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let name = ""; let qty: number | null = 1; let value: number | null = null;
    const parts = line.split(/[;\t|]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) { name = parts[0]!; qty = parseSilver(parts[1]!.replace(/^x/i, "")); value = parseSilver(parts[2]!); }
    else if (parts.length === 2) { name = parts[0]!; value = parseSilver(parts[1]!); }
    else {
      const m = /^(.*?)(?:\s*[x×]\s*(\d+))?\s+(\d[\d.,]*[km]?)$/i.exec(line);
      if (m) { name = m[1]!.trim(); qty = m[2] ? Number(m[2]) : 1; value = parseSilver(m[3]!); }
    }
    if (!name || name.length > 80 || qty === null || qty < 1 || qty > 100_000 || value === null) invalid.push(line);
    else items.push({ name, quantity: qty, unit_value: value });
  }
  return { items, invalid };
}

/** Linhas "nick; dano; cura" (cura opcional) para o dps. */
export function parseDpsPaste(text: string): { rows: { nick: string; damage: number; healing: number }[]; invalid: string[] } {
  const rows: { nick: string; damage: number; healing: number }[] = []; const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[;\t|]/).map((p) => p.trim()).filter(Boolean);
    const damage = parts[1] !== undefined ? parseSilver(parts[1]) : null;
    const healing = parts[2] !== undefined ? parseSilver(parts[2]) : 0;
    const nick = parts[0] ?? "";
    if (nick.length < 2 || nick.length > 32 || damage === null || healing === null) invalid.push(line);
    else rows.push({ nick, damage, healing });
  }
  return { rows, invalid };
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Texto pronto para colar no Discord ou WhatsApp. */
export function splitSummaryText(title: string, result: SplitResult): string {
  const head = [`💰 Divisão do loot — ${title}`, `Total: ${fmt(result.gross)}`];
  if (result.guildCut > 0) head.push(`Guilda: ${fmt(result.guildCut)}`);
  if (result.repairPool > 0) head.push(`Reparos devolvidos: ${fmt(result.repairPool)}`);
  const lines = result.rows.map((r) => `• ${r.nick}: ${fmt(r.total)}${r.repairRefund > 0 ? ` (inclui ${fmt(r.repairRefund)} de reparo)` : ""}`);
  const tail = result.leftover > 0 ? [`Sobra: ${fmt(result.leftover)} (fica com a guilda)`] : [];
  return [head.join(" · "), ...lines, ...tail].join("\n");
}
