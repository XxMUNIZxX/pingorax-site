import { afterEach, describe, expect, it, vi } from "vitest";
import { albionIconLink, downloadAlbionIcon } from "@/lib/albion-icons";

const link = "https://render.albiononline.com/v1/item/T8_MAIN_MACE.png?count=1&quality=1";
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
describe("Official Albion image downloads", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("accepts the supplied official item URL with query parameters", () => {
    expect(albionIconLink.parse(link)).toBe(link);
  });
  it.each(["http://render.albiononline.com/v1/item/A.png", "https://render.albiononline.com.evil.test/v1/item/A.png", "https://localhost/v1/item/A.png", "https://render.albiononline.com/other/A.png", "https://user:pass@render.albiononline.com/v1/item/A.png", "https://render.albiononline.com:8443/v1/item/A.png"])("blocks unsupported targets %s", async (url) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(downloadAlbionIcon(url)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns valid PNG bytes as base64 and forbids redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(signature)); vi.stubGlobal("fetch", fetchMock);
    expect(await downloadAlbionIcon(link)).toEqual({ base64: btoa(String.fromCharCode(...signature)) });
    expect(fetchMock).toHaveBeenCalledWith(link, expect.objectContaining({ redirect: "error" }));
  });
  it("rejects invalid PNG bytes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not PNG")));
    await expect(downloadAlbionIcon(link)).rejects.toThrow("PNG válido");
  });
  it("bounds downloads even without content-length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(2 * 1024 * 1024 + 1))));
    await expect(downloadAlbionIcon(link)).rejects.toThrow("2 MB");
  });
});