import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT_FILTERS, filterContents } from "@/lib/content-filters";
const rows = [
  { id: "a", mode: "PVP", caller_name: "Róger", content_type: "BLACK ZONE" },
  { id: "b", mode: "PVE", caller_name: "Maria", content_type: "AVALON" },
  { id: "c", mode: null, caller_name: null, content_type: null },
];
describe("Content filters", () => {
  it("keeps legacy contents with no filters", () => expect(filterContents(rows, EMPTY_CONTENT_FILTERS)).toEqual(rows));
  it("combines three filters ignoring caller case and accents", () => expect(filterContents(rows, { mode: "PVP", caller: " ROG ", type: "BLACK ZONE" }).map(row => row.id)).toEqual(["a"]));
  it("filters PVE independently", () => expect(filterContents(rows, { ...EMPTY_CONTENT_FILTERS, mode: "PVE" }).map(row => row.id)).toEqual(["b"]));
  it("returns no rows for mismatched combinations", () => expect(filterContents(rows, { mode: "PVE", caller: "Roger", type: "BLACK ZONE" })).toEqual([]));
});