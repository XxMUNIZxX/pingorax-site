import { describe, expect, it } from "vitest";
import { isMissingRoleColumn, moveItem, roleLabel, WEAPON_ROLES } from "@/lib/weapon-roles";

describe("moveItem", () => {
  it("sobe e desce sem alterar o original", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 1, 1)).toEqual(["a", "c", "b"]);
    expect(list).toEqual(["a", "b", "c"]);
  });
  it("não faz nada nas pontas", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 5, -1)).toEqual(["a", "b"]);
  });
});

describe("funções das armas", () => {
  it("tem as seis funções pedidas", () => {
    expect(WEAPON_ROLES.map((r) => r.label)).toEqual(["Tank", "Off-Tank", "Healer", "Support", "DPS Melee", "DPS Ranged"]);
    expect(roleLabel("dps_ranged")).toBe("DPS Ranged");
    expect(roleLabel(null)).toBeNull();
    expect(roleLabel("outra")).toBeNull();
  });
  it("reconhece só o erro de coluna role ausente", () => {
    expect(isMissingRoleColumn({ code: "42703", message: 'column event_weapons.role does not exist' })).toBe(true);
    expect(isMissingRoleColumn({ code: "PGRST204", message: "Could not find the 'role' column of 'event_weapons' in the schema cache" })).toBe(true);
    expect(isMissingRoleColumn({ code: "42501", message: "permission denied for table event_weapons" })).toBe(false);
    expect(isMissingRoleColumn(null)).toBe(false);
  });
});
