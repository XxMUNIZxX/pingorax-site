import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), select: vi.fn(), in: vi.fn(), order: vi.fn(), icons: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/lib/weapon-icons", () => ({ resolveWeaponIcons: mocks.icons }));
import { fetchManagedEvents } from "@/lib/events";

describe("Managed event permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ in: mocks.in });
    mocks.in.mockReturnValue({ order: mocks.order });
    mocks.icons.mockResolvedValue(new Map());
  });
  it("queries only database-authorized event IDs without caller ownership", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: "shared-event" }], error: null });
    mocks.order.mockResolvedValue({ data: [{ id: "shared-event", event_weapons: [], signups: [] }], error: null });
    expect((await fetchManagedEvents()).map(event => event.id)).toEqual(["shared-event"]);
    expect(mocks.rpc).toHaveBeenCalledWith("managed_event_ids");
    expect(mocks.in).toHaveBeenCalledWith("id", ["shared-event"]);
  });
  it("does not load public rows when no events are authorized", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchManagedEvents()).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("fails closed on permission lookup errors", async () => {
    const error = new Error("Access denied");
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(fetchManagedEvents()).rejects.toThrow("Access denied");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});