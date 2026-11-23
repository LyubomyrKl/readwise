import { test, expect, request as api } from "@playwright/test";
import { EMAIL, PASSWORD } from "./global-setup";

/**
 * The password in a real browser, on the test stack's own account: changed in Settings, Account,
 * with the current one (and back, so the stack keeps its password), and "Forgot password?" on a
 * server without email, which says where the one-time link comes from. Setting a password through
 * a link ends every session, this suite's too, so the link itself is proven in the API's DB spec
 * (auth-password.db-spec.ts).
 */
test.describe("Password", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one browser is enough for these forms");

  test("changes in Settings with the current one; this session stays, the new one signs in", async ({ page, baseURL }) => {
    const changed = `${PASSWORD}-changed`;
    await page.goto("/settings/account");
    await page.getByLabel("Current password").fill("not the password");
    await page.getByLabel("New password", { exact: true }).fill(changed);
    await page.getByLabel("New password again").fill(changed);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That password does not match")).toBeVisible();

    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed")).toBeVisible();
    try {
      // signing in from elsewhere: a request context of its own, so this page keeps its session
      const elsewhere = await api.newContext({ baseURL, ignoreHTTPSErrors: true });
      const login = (password: string) => elsewhere.post("/api/auth/login", { data: { email: EMAIL, password } });
      expect((await login(PASSWORD)).status()).toBe(401);
      expect((await login(changed)).ok()).toBe(true);
      await elsewhere.dispose();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    } finally {
      // back to the stack's password, from this page's session (the one the other specs share)
      const back = await page.request.post("/api/gw/auth/password", { data: { currentPassword: changed, newPassword: PASSWORD } });
      expect(back.ok(), await back.text()).toBe(true);
    }
  });

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("forgot password on a server without email says where the link comes from", async ({ page }) => {
      await page.goto("/auth/login");
      await page.getByRole("link", { name: "Forgot password?" }).click();
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByRole("button", { name: "Send me a link" }).click();
      await expect(page.getByText("Get a link from the server")).toBeVisible();
      await expect(page.locator("pre")).toContainText(`reset-password.cli.js ${EMAIL}`);
    });

    test("a link that is not one sets nothing", async ({ page }) => {
      await page.goto(`/auth/reset-password?token=${"x".repeat(43)}`);
      await page.getByLabel("New password").fill("whatever-it-is");
      await page.getByLabel("The same again").fill("whatever-it-is");
      await page.getByRole("button", { name: "Set the new password" }).click();
      await expect(page.getByText("This link has expired or was already used")).toBeVisible();
    });
  });
});
