import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_IMAGE, prepareShareImage, shareImageUrl } from "@/lib/share-image";

describe("sharing image", () => {
  it("uses the current site for the default image", () => {
    expect(shareImageUrl()).toBe(DEFAULT_SHARE_IMAGE);
    expect(DEFAULT_SHARE_IMAGE).toBe("https://pingorax.online/og-banner.jpg?v=2");
  });
  it("uses a public versioned endpoint, without exposing owner paths", () => {
    expect(shareImageUrl("owner/123.jpg")).toBe("https://pingorax.online/api/public/share-image?v=123.jpg");
    expect(shareImageUrl("owner/456.jpg")).not.toBe(shareImageUrl("owner/123.jpg"));
  });
  it("rejects non-image files", async () => {
    await expect(prepareShareImage(new File(["no"], "image.svg", { type: "image/svg+xml" }))).rejects.toThrow("PNG, JPG ou WebP");
  });
  it("rejects oversized and empty files", async () => {
    await expect(prepareShareImage(new File([], "image.png", { type: "image/png" }))).rejects.toThrow("5 MB");
    await expect(prepareShareImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "image.png", { type: "image/png" }))).rejects.toThrow("5 MB");
  });
});