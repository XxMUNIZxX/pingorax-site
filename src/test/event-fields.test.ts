import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), icons: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/weapon-icons", () => ({ resolveWeaponIcons: mocks.icons }));
import { fetchEvent } from "@/lib/events";

describe("Event fields loading", () => {
  it("correctly handles new fields (mode, caller_name, content_type)", async () => {
    const mockData = {
      id: "1",
      created_by: "u1",
      title: "Test Event",
      description: "Desc",
      starts_at: new Date().toISOString(),
      max_players: 20,
      mode: "PVP",
      caller_name: "Shadow",
      content_type: "BLACK ZONE",
      event_weapons: [],
      signups: []
    };
    
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: mockData, error: null });
    mocks.icons.mockResolvedValue(new Map());

    const event = await fetchEvent("1");
    expect(event).not.toBeNull();
    expect(event?.mode).toBe("PVP");
    expect(event?.caller_name).toBe("Shadow");
    expect(event?.content_type).toBe("BLACK ZONE");
  });

  it("handles null fields correctly", async () => {
    const mockData = {
      id: "2",
      created_by: "u1",
      title: "Null Fields Event",
      description: null,
      starts_at: new Date().toISOString(),
      max_players: 10,
      mode: null,
      caller_name: null,
      content_type: null,
      event_weapons: [],
      signups: []
    };
    
    mocks.maybeSingle.mockResolvedValue({ data: mockData, error: null });

    const event = await fetchEvent("2");
    expect(event?.mode).toBeNull();
    expect(event?.caller_name).toBeNull();
    expect(event?.content_type).toBeNull();
  });
});
