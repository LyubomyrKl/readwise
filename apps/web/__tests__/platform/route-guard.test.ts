import { isAuthRoute, needsAuth } from "@platform/auth/route-guard";

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
});
