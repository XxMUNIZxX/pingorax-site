/** Regras da sala de voz de cada conteúdo (sem dependências: roda no servidor e nos testes). */

export const roomName = (eventId: string) => `pingorax-${eventId}`;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Quem entra na sala: o caller, quem gerencia o conteúdo e quem pingou (inscrito ou na fila), pelo nick do perfil. */
export function canJoinVoice(input: { nick: string | null; signups: string[]; waitlist: string[]; caller: string | null; manager: boolean }): boolean {
  if (input.manager) return true;
  const nick = input.nick?.trim();
  if (!nick || nick.length < 2) return false;
  return [...input.signups, ...input.waitlist, ...(input.caller ? [input.caller] : [])].some((n) => same(n, nick));
}
