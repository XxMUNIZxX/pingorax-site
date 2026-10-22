import type { MyPing } from "@/lib/my-pings";

/** Quanto falta para começar, em minutos, e o texto do aviso ("começa em 20 min", "começou há 5 min"). */
export function startsInMinutes(startsAt: string, now = Date.now()): number {
  return Math.round((new Date(startsAt).getTime() - now) / 60_000);
}

export function startText(minutes: number): string {
  if (minutes > 1) return `começa em ${minutes} min`;
  if (minutes >= -1) return "está começando agora";
  return `começou há ${-minutes} min`;
}

/**
 * O conteúdo confirmado mais próximo que começa em até `windowMinutes` (ou começou há até 30 min).
 * Quem está só na fila não recebe o aviso.
 */
export function nextStarting(upcoming: MyPing[], now = Date.now(), windowMinutes = 60): MyPing | null {
  return upcoming
    .filter((p) => p.status === "confirmed")
    .map((p) => ({ p, m: startsInMinutes(p.starts_at, now) }))
    .filter(({ m }) => m <= windowMinutes && m >= -30)
    .sort((a, b) => a.m - b.m)[0]?.p ?? null;
}
