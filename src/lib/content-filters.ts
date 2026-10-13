export const CONTENT_MODES = ["PVP", "PVE"] as const;
export const CONTENT_TYPES = ["BLACK ZONE", "FACÇÃO", "AVALON", "RED ZONE", "ZVZ", "CTA"] as const;
export type ContentFilters = { mode: string; caller: string; type: string };
export const EMPTY_CONTENT_FILTERS: ContentFilters = { mode: "all", caller: "", type: "all" };
const normalize = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function filterContents<T extends { mode: string | null; caller_name: string | null; content_type: string | null }>(events: T[], filters: ContentFilters): T[] {
  const caller = normalize(filters.caller);
  return events.filter(event => (filters.mode === "all" || event.mode === filters.mode) && (filters.type === "all" || event.content_type === filters.type) && (!caller || normalize(event.caller_name ?? "").includes(caller)));
}