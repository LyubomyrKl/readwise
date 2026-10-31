import { READER_PAGE, newNonce, readerCsp } from "@platform/security/csp";

describe("the reader's Content-Security-Policy", () => {
  const policy = readerCsp("abc123");
  const directive = (name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("runs only scripts with the nonce (and what they load), never inline ones", () => {
    expect(directive("script-src")).toContain("'nonce-abc123'");
    expect(directive("script-src")).toContain("'strict-dynamic'");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
  });

  it("lets the page frame its own book chapters (Safari applies the inherited frame-ancestors)", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive("frame-src")).toContain("blob:");
  });

  it("allows what books and PDF.js need and nothing from elsewhere", () => {
    expect(directive("style-src")).toContain("'unsafe-inline'");
    expect(directive("img-src")).toBe("img-src 'self' blob: data:");
    expect(directive("script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("connect-src")).toBe("connect-src 'self'");
  });

  it("adds eval only for the dev server", () => {
    expect(readerCsp("n", true)).toContain("'unsafe-eval'");
  });

  it("applies to the read page only", () => {
    expect(READER_PAGE.test("/apps/reader/book/abc/read")).toBe(true);
    expect(READER_PAGE.test("/apps/reader/book/abc")).toBe(false);
    expect(READER_PAGE.test("/apps/reader/book/abc/edition")).toBe(false);
  });

  it("makes a different nonce each time", () => {
    expect(newNonce()).not.toBe(newNonce());
    expect(newNonce()).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
