import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Money in a real browser, on the test stack's own account (docs/document-architecture.md,
 * Testing): the account's balance under the movement form's picker, the history showing what
 * stands, cards dragged into an order that stays, a holding added and priced on its account's
 * page, and a category merged away. Every run makes its own accounts and categories, so the spec
 * runs again on the same stack.
 */
const run = Date.now().toString(36);
const day = "2026-11-02";

async function call<T>(request: APIRequestContext, method: "get" | "post", path: string, data?: unknown): Promise<T> {
  const response = method === "get" ? await request.get(`/api/gw${path}`) : await request.post(`/api/gw${path}`, { data });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

const account = (request: APIRequestContext, name: string, opening?: string) =>
  call<{ id: string }>(request, "post", "/money/accounts", {
    name,
    type: "bank",
    currencies: ["PLN"],
    ...(opening ? { openingBalances: [{ currency: "PLN", amount: opening, date: "2026-11-01" }] } : {}),
  });

const expense = (request: APIRequestContext, accountId: string, amount: string, note: string, categoryId?: string) =>
  call<{ id: string }>(request, "post", "/money/movements", {
    kind: "expense",
    input: { date: day, accountId, currency: "PLN", amount, note, ...(categoryId ? { categoryId } : {}) },
  });

/** The names of the accounts the page shows, in its order (from the drag handles). */
const shownOrder = (page: Page) =>
  page.getByRole("button", { name: /^Move / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.slice(5)));

test.describe("Money", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one browser is enough for these forms");

  test("the movement form shows the picked account's balance", async ({ page, request }) => {
    await account(request, `Balance ${run}`, "1234.56");
    await page.goto("/apps/money/transactions/new");
    await page.locator("#mv-account").click();
    await page.getByRole("option", { name: `Balance ${run}` }).click();
    await expect(page.getByText("Balance", { exact: true }).locator("..")).toContainText("1,234.56");
  });

  test("the history shows what stands; the trail on request", async ({ page, request }) => {
    const mbank = (await account(request, `History ${run}`, "500.00")).id;
    await expense(request, mbank, "10.00", `kept ${run}`);
    const typo = await expense(request, mbank, "20.00", `typo ${run}`);
    await call(request, "post", `/money/movements/correct/${typo.id}`, {
      kind: "expense",
      input: { date: day, accountId: mbank, currency: "PLN", amount: "25.00", note: `fixed ${run}` },
    });
    const gone = await expense(request, mbank, "30.00", `never happened ${run}`);
    await call(request, "post", `/money/transactions/${gone.id}/reverse`, {});

    await page.goto(`/apps/money/transactions?account=${mbank}`);
    await expect(page.getByText(`fixed ${run}`)).toBeVisible();
    await expect(page.getByText(`kept ${run}`)).toBeVisible();
    await expect(page.getByText(`typo ${run}`)).toHaveCount(0);
    await expect(page.getByText(`never happened ${run}`)).toHaveCount(0);

    await page.getByLabel("Show corrections and reversals (the whole trail)").check();
    await expect(page.getByText(`typo ${run}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`never happened ${run}`, { exact: true })).toBeVisible();
  });

  test("account cards dragged into an order keep it", async ({ page, request }) => {
    const names = ["first", "second", "third"].map((n) => `${n} ${run}`);
    for (const name of names) await account(request, name);
    await page.goto("/apps/money/accounts");
    const mine = async () => (await shownOrder(page)).filter((n) => names.includes(n));
    await expect.poll(mine).toEqual(names);

    // the stack keeps the accounts of earlier runs: bring the new cards on screen before dragging
    await page.getByRole("button", { name: `Move ${names[2]}` }).scrollIntoViewIfNeeded();
    const from = (await page.getByRole("button", { name: `Move ${names[2]}` }).boundingBox())!;
    const to = (await page.getByRole("button", { name: `Move ${names[0]}` }).boundingBox())!;
    const saved = page.waitForResponse((r) => r.url().endsWith("/money/accounts/order") && r.request().method() === "PUT");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 10, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();
    expect((await saved).ok()).toBe(true);

    await page.reload();
    await expect.poll(mine).toEqual([names[2], names[0], names[1]]);
  });

  test("an account's class counts what it holds, its units too", async ({ page, request }) => {
    const klass = await call<{ id: string }>(request, "post", "/money/asset-classes", { name: `Equity ${run}` });
    const broker = await call<{ id: string }>(request, "post", "/money/accounts", {
      name: `Broker ${run}`,
      type: "investment",
      currencies: ["PLN"],
      classId: klass.id,
      openingBalances: [{ currency: "PLN", amount: "5000.00", date: "2026-11-01" }],
    });
    const asset = await call<{ id: string }>(request, "post", "/money/assets", { code: `E${run}`.slice(0, 12), name: "World ETF", quoteCurrency: "PLN" });
    await call(request, "post", "/money/movements", {
      kind: "buy",
      input: { date: "2026-11-02", accountId: broker.id, assetId: asset.id, units: "10", total: "1000.00", currency: "PLN" },
    });
    await call(request, "post", "/money/prices", { assetId: asset.id, date: "2026-11-03", price: "120.00" });

    await page.goto("/apps/money");
    // 4 000 cash left and 10 units at 120, both in the account's class
    await expect(page.getByText(`Equity ${run}`).locator("xpath=ancestor::div[2]")).toContainText("PLN 5,200.00");
  });

  test("a one-off left out of the totals shows apart from them", async ({ page, request }) => {
    const wallet = (await account(request, `One-off ${run}`)).id;
    const sold = (await call<{ id: string; name: string }[]>(request, "get", "/money/categories")).find((c) => c.name === "Sold belongings")!;
    const today = new Date().toISOString().slice(0, 10);
    await call(request, "post", "/money/movements", {
      kind: "income",
      input: { date: today, accountId: wallet, currency: "PLN", amount: "999.99", categoryId: sold.id, note: `car ${run}` },
    });
    await page.goto("/apps/money");
    await expect(page.getByText("Not counted in these totals:")).toContainText(/Sold belongings \+PLN\s[\d,]+\.\d\d/); // the currency formatter puts a no-break space
  });

  test("an investment account adds a holding of a new asset, already owned, in one form, and prices it", async ({ page, request }) => {
    const holder = await call<{ id: string }>(request, "post", "/money/accounts", {
      name: `Holder ${run}`,
      type: "investment",
      currencies: ["PLN"],
      openingBalances: [{ currency: "PLN", amount: "2000.00", date: "2026-11-01" }],
    });
    const code = `H${run}`.toUpperCase().slice(0, 12);
    await page.goto(`/apps/money/accounts/${holder.id}`);
    await expect(page.getByText("Buy something, or record what you already own")).toBeVisible();
    await page.getByRole("link", { name: "Add a holding" }).first().click();

    await page.getByRole("tab", { name: "Already own them" }).click();
    await page.getByLabel("Asset").click();
    await page.getByRole("option", { name: "+ New asset…" }).click();
    await page.getByLabel("Short name").fill(code);
    await page.getByLabel("Full name").fill("A fund held before tracking");
    await page.getByLabel("Price currency").click();
    await page.getByRole("option", { name: /^PLN/ }).click();
    await page.getByRole("tab", { name: "I enter prices" }).click();
    await page.getByLabel("Units").fill("5");
    await page.getByLabel("What they cost").fill("500");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/apps\/money\/transactions\/[^/]+$/);

    await page.goto(`/apps/money/accounts/${holder.id}`);
    const holdings = page.getByRole("region", { name: "Holdings" });
    await expect(holdings).toContainText(code);
    await expect(holdings).toContainText("5");
    // already owned: no money left the account
    await expect(page.getByRole("region", { name: "Balances" })).toContainText("2,000.00");

    // its price entered on the account's page, where the sheet offers only what the account holds
    await holdings.getByRole("button", { name: "Update prices" }).click();
    const sheet = page.getByRole("dialog", { name: "Update prices" });
    await expect(sheet.locator('input[id^="price-"]')).toHaveCount(1); // this asset, none of the stack's others
    await sheet.getByLabel(code, { exact: true }).fill("120");
    await sheet.getByRole("button", { name: "Save prices" }).click();
    await expect(holdings).toContainText("600.00"); // 5 units at 120
  });

  test("the old Investments address opens the accounts, which hold the investments now", async ({ page }) => {
    await page.goto("/apps/money/investments");
    await expect(page).toHaveURL(/\/apps\/money\/accounts$/);
    await page.getByRole("link", { name: "Assets and classes" }).click();
    await expect(page.getByRole("heading", { name: "Assets and classes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update prices" })).toBeVisible();
  });

  test("a category merged in settings is gone and its history counts in the other", async ({ page, request }) => {
    const wallet = (await account(request, `Merge ${run}`, "100.00")).id;
    const dup = await call<{ id: string }>(request, "post", "/money/categories", { name: `Dup ${run}`, kind: "expense" });
    await call(request, "post", "/money/categories", { name: `Keep ${run}`, kind: "expense" });
    await expense(request, wallet, "12.00", `ride ${run}`, dup.id);

    await page.goto("/settings/money");
    const row = page.getByRole("listitem").filter({ hasText: `Dup ${run}` });
    await row.getByRole("button", { name: "Merge" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: `Keep ${run}` }).click();
    await dialog.getByRole("button", { name: "Merge" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: `Dup ${run}` })).toHaveCount(0);

    await page.goto(`/apps/money/transactions?account=${wallet}`);
    await expect(page.getByRole("link").filter({ hasText: `ride ${run}` })).toContainText(`Keep ${run}`);
  });
});
