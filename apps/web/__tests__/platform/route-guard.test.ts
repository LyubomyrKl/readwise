import { isAuthRoute, needsAuth, safeNext } from "@platform/auth/route-guard";

describe("route guard", () => {
  it.each(["/", "/apps", "/apps/reader", "/apps/reader/book/1/read", "/settings", "/settings/reader"])(
    "protects %s",
    (pathname) => expect(needsAuth(pathname)).toBe(true)
  );

  it.each(["/auth/login", "/auth/register", "/offline", "/application", "/settingsx", "/manifest.json"])(
    "leaves %s public",
    (pathname) => expect(needsAuth(pathname)).toBe(false)
  );

  it("recognises the auth pages", () => {
    expect(isAuthRoute("/auth/login")).toBe(true);
    expect(isAuthRoute("/auth/register")).toBe(true);
    expect(isAuthRoute("/auth")).toBe(false);
    expect(isAuthRoute("/apps/reader")).toBe(false);
  });

  it("goes on only to a path on this site after signing in", () => {
    const origin = "https://wb.example";
    expect(safeNext("/apps/money?tab=1#x", origin)).toBe("/apps/money?tab=1#x");
    expect(safeNext(null, origin)).toBe("/");
    for (const evil of ["javascript:alert(1)", "https://evil.example/", "//evil.example/", "/\\evil.example/", "evil.example", " /apps"]) {
      expect(safeNext(evil, origin)).toBe("/");
    }
  });
});
