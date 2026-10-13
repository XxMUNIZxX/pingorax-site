import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CONTENT_MODES, CONTENT_TYPES } from "@/lib/content-filters";

export type ContentKind = "mode" | "type";
export type ContentOption = { id: string; kind: ContentKind; name: string; position: number };

export async function fetchContentOptions(): Promise<ContentOption[]> {
  const { data, error } = await supabase
    .from("content_options")
    .select("id,kind,name,position")
    .order("position")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ContentOption[];
}

/**
 * Separa as opções em modos e tipos. Enquanto a lista não carregou (ou se o
 * banco ainda não tem a tabela), usa os valores padrão de antes.
 */
export function resolveContentOptions(options: ContentOption[] | undefined) {
  if (!options) return { modes: [...CONTENT_MODES] as string[], types: [...CONTENT_TYPES] as string[] };
  return {
    modes: options.filter((option) => option.kind === "mode").map((option) => option.name),
    types: options.filter((option) => option.kind === "type").map((option) => option.name),
  };
}

export function useContentOptions() {
  const { data } = useQuery({ queryKey: ["content-options"], queryFn: fetchContentOptions, staleTime: 60_000 });
  return resolveContentOptions(data);
}

/** Mantém no menu um valor antigo que já foi removido da lista, para o editor não ficar em branco. */
export function withCurrentValue(list: string[], current: string | null) {
  return current && !list.includes(current) ? [...list, current] : list;
}
