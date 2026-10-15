import { supabase } from "@/integrations/supabase/client";

export type GroupMember = { id: string; build_id: string; role: string | null; quantity: number; position: number };
export type BuildGroup = {
  id: string; owner_id: string; name: string; author_name: string | null; description: string | null; content_type: string | null;
  created_at: string; updated_at: string; members: GroupMember[];
};
export type GroupMemberDraft = { build_id: string; role: string; quantity: number };
export type GroupDraft = { name: string; author_name: string; description: string; content_type: string | null; members: GroupMemberDraft[] };

export const emptyGroupDraft = (): GroupDraft => ({ name: "", author_name: "", description: "", content_type: null, members: [] });

/** Papéis comuns, só como sugestão no campo de papel. */
export const ROLE_SUGGESTIONS = ["Tank", "Healer", "Suporte", "DPS", "Caller", "Battlemount", "Scout"];

const SELECT = "id,owner_id,name,author_name,description,content_type,created_at,updated_at,build_group_members(id,build_id,role,quantity,position)";

type GroupRow = Omit<BuildGroup, "members"> & { build_group_members: GroupMember[] | null };

export async function fetchBuildGroups(): Promise<BuildGroup[]> {
  const { data, error } = await supabase.from("build_groups").select(SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as GroupRow[]).map(({ build_group_members, ...group }) => ({
    ...group,
    members: [...(build_group_members ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export const groupSize = (group: Pick<BuildGroup, "members">) => group.members.reduce((sum, m) => sum + m.quantity, 0);

export function draftFromGroup(group: BuildGroup): GroupDraft {
  return {
    name: group.name, author_name: group.author_name ?? "", description: group.description ?? "", content_type: group.content_type,
    members: group.members.map((m) => ({ build_id: m.build_id, role: m.role ?? "", quantity: m.quantity })),
  };
}

/** Salva o grupo e a lista de builds. Atualiza as builds que continuam, insere as novas e só então remove as retiradas. */
export async function saveBuildGroup(id: string | undefined, draft: GroupDraft): Promise<{ id?: string; error: { code?: string; message: string } | null }> {
  const fields = {
    name: draft.name.trim(), author_name: draft.author_name.trim() || null,
    description: draft.description.trim() || null, content_type: draft.content_type || null,
  };
  let groupId = id;
  if (groupId) {
    const { error } = await supabase.from("build_groups").update(fields).eq("id", groupId);
    if (error) return { id: groupId, error };
  } else {
    const { data, error } = await supabase.from("build_groups").insert(fields).select("id").single();
    if (error || !data) return { error: error ?? { message: "Grupo não criado." } };
    groupId = data.id;
  }
  const rows = draft.members.map((m, position) => ({
    group_id: groupId!, build_id: m.build_id, role: m.role.trim() || null, quantity: Math.min(50, Math.max(1, Math.round(m.quantity) || 1)), position,
  }));
  if (rows.length) {
    const { error } = await supabase.from("build_group_members").upsert(rows, { onConflict: "group_id,build_id" });
    if (error) return { id: groupId!, error };
  }
  const keep = rows.map((r) => r.build_id);
  const removal = supabase.from("build_group_members").delete().eq("group_id", groupId);
  const { error } = await (keep.length ? removal.not("build_id", "in", `(${keep.join(",")})`) : removal);
  return { id: groupId!, error };
}
