import { describe, expect, it } from "vitest";
import { resolveContentOptions, withCurrentValue, type ContentOption } from "@/lib/content-options";

const options: ContentOption[] = [
  { id: "1", kind: "mode", name: "PVP", position: 10 },
  { id: "2", kind: "type", name: "AVALON", position: 10 },
  { id: "3", kind: "type", name: "CTA", position: 20 },
];

describe("Content options", () => {
  it("separates modes and types from the saved list", () => {
    expect(resolveContentOptions(options)).toEqual({ modes: ["PVP"], types: ["AVALON", "CTA"] });
  });
  it("uses the default list while options are not loaded", () => {
    const fallback = resolveContentOptions(undefined);
    expect(fallback.modes).toEqual(["PVP", "PVE"]);
    expect(fallback.types).toContain("BLACK ZONE");
  });
  it("respects an empty list chosen by the admin", () => {
    expect(resolveContentOptions([])).toEqual({ modes: [], types: [] });
  });
  it("keeps a removed value visible when editing an old content", () => {
    expect(withCurrentValue(["PVP"], "PVE")).toEqual(["PVP", "PVE"]);
    expect(withCurrentValue(["PVP"], "PVP")).toEqual(["PVP"]);
    expect(withCurrentValue(["PVP"], null)).toEqual(["PVP"]);
  });
});
