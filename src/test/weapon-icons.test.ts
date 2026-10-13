import { afterEach, describe, expect, it, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { fetchWeaponIcon, validateWeaponIcon } from "@/lib/weapon-icons";

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function mockFile(name: string, type: string, bytes: Uint8Array, size = bytes.length) {
  return { name, type, size, slice: () => ({ arrayBuffer: async () => bytes.buffer }) } as unknown as File;
}

describe("Weapon PNG validation", () => {
  it("accepts a PNG with a valid signature", async () => {
    await expect(validateWeaponIcon(mockFile("sword.png", "image/png", signature))).resolves.toBeUndefined();
  });
  it("rejects other formats", async () => {
    await expect(validateWeaponIcon(mockFile("sword.jpg", "image/jpeg", signature))).rejects.toThrow("PNG");
  });
  it("rejects a renamed non-PNG", async () => {
    await expect(validateWeaponIcon(mockFile("sword.png", "image/png", new Uint8Array(8)))).rejects.toThrow("válido");
  });
  it("rejects files above 2 MB", async () => {
    await expect(validateWeaponIcon(mockFile("sword.png", "image/png", signature, 2 * 1024 * 1024 + 1))).rejects.toThrow("2 MB");
  });
});

describe("Weapon PNG links", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("stages official Albion downloads without fetching from the browser", async () => {
    vi.stubGlobal("File", NodeFile);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const load = vi.fn().mockResolvedValue({ base64: btoa(String.fromCharCode(...signature)) });
    const file = await fetchWeaponIcon("https://render.albiononline.com/v1/item/T8_MAIN_MACE.png?count=1&quality=1", load);
    await expect(validateWeaponIcon(file)).resolves.toBeUndefined();
    expect(load).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("downloads and stages a PNG from an HTTPS link", async () => {
    vi.stubGlobal("File", NodeFile);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(signature, { headers: { "content-type": "image/png" } })));
    const file = await fetchWeaponIcon(" https://example.com/icon ");
    expect(file.name).toBe("weapon-icon.png");
    await expect(validateWeaponIcon(file)).resolves.toBeUndefined();
  });
  it.each(["invalid", "http://example.com/icon.png", "data:image/png;base64,a", "https://user:pass@example.com/icon.png"])("rejects unsafe or invalid link %s", async (url) => {
    await expect(fetchWeaponIcon(url)).rejects.toThrow(/link/);
  });
  it("explains blocked downloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchWeaponIcon("https://example.com/icon.png")).rejects.toThrow("site pode bloquear");
  });
  it("rejects non-PNG images and unsuccessful responses", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(signature, { headers: { "content-type": "image/jpeg" } })).mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWeaponIcon("https://example.com/icon.jpg")).rejects.toThrow("PNG");
    await expect(fetchWeaponIcon("https://example.com/missing.png")).rejects.toThrow("carregar");
  });
  it("rejects oversized linked images", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(signature, { headers: { "content-type": "image/png", "content-length": String(2 * 1024 * 1024 + 1) } })));
    await expect(fetchWeaponIcon("https://example.com/icon.png")).rejects.toThrow("2 MB");
  });
});