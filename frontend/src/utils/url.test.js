import { describe, expect, it } from "vitest";

import { normalizeExternalUrl } from "./url";

describe("normalizeExternalUrl", () => {
  it("normalizes bare hostnames to https", () => {
    expect(normalizeExternalUrl("example.com")).toBe("https://example.com/");
  });

  it("keeps valid http and https URLs", () => {
    expect(normalizeExternalUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
    expect(normalizeExternalUrl("http://example.com/")).toBe("http://example.com/");
  });

  it("rejects scriptable and non-web protocols", () => {
    expect(normalizeExternalUrl("javascript:alert(1)")).toBe("");
    expect(normalizeExternalUrl("data:text/html;base64,PHNjcmlwdA==")).toBe("");
    expect(normalizeExternalUrl("file:///etc/passwd")).toBe("");
  });

  it("rejects whitespace-obfuscated URLs", () => {
    expect(normalizeExternalUrl("java\nscript:alert(1)")).toBe("");
    expect(normalizeExternalUrl("https://example.com/%0a")).toBe("https://example.com/%0a");
    expect(normalizeExternalUrl("https://exa mple.com")).toBe("");
  });
});
