import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Money in a real browser, on the test stack's own account (docs/document-architecture.md,
 * Testing): the account's balance under the movement form's picker, the history showing what
 * stands, cards dragged into an order that stays, a holding added and priced on its account's
 * page, the back arrow going back, a movement changed and deleted on its own page, quick entry
 * (learning from the history, saving another, undo), several movements at once, Insights (where the
 * money is heading), and a category merged away. Every run makes its own accounts and categories, so the spec runs again on the same
 * stack.
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
    // saved, the form goes back where it was opened
    await page.waitForURL(new RegExp(`/apps/money/accounts/${holder.id}$`));

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

  test("the back arrow goes back where you came from, or up when the page was opened directly", async ({ page, context, request }) => {
    const wallet = (await account(request, `Back ${run}`, "100.00")).id;
    const coffee = await expense(request, wallet, "5.00", `coffee ${run}`);
    const back = (on: Page) => on.getByRole("link", { name: "Back", exact: true }).click();
    const onAccount = new RegExp(`/apps/money/accounts/${wallet}$`);

    // from an account to one of its movements and back: the account, not the list of all movements
    await page.goto(`/apps/money/accounts/${wallet}`);
    await page.getByRole("link").filter({ hasText: `coffee ${run}` }).click();
    await page.waitForURL(new RegExp(`/apps/money/transactions/${coffee.id}$`));
    await back(page);
    await page.waitForURL(onAccount);

    // a movement logged from the account: quick entry over the page, which shows it once saved
    await page.getByRole("button", { name: "Movement", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "New movement" });
    await sheet.getByLabel("Amount", { exact: true }).fill("7.00");
    await sheet.getByLabel("What for").fill(`tea ${run}`);
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(sheet).toBeHidden();
    expect(page.url()).toMatch(onAccount);
    await expect(page.getByRole("link").filter({ hasText: `tea ${run}` })).toBeVisible();

    // opened directly, in a tab of its own: up to the list of movements
    const fresh = await context.newPage();
    await fresh.goto(`/apps/money/transactions/${coffee.id}`);
    await back(fresh);
    await fresh.waitForURL(/\/apps\/money\/transactions$/);
    await fresh.close();
  });

  test("a movement opens in its own form: saved unchanged it stays, changed it is corrected, deleted it goes", async ({ page, request }) => {
    const wallet = (await account(request, `Edit ${run}`, "100.00")).id;
    await expense(request, wallet, "5.00", `latte ${run}`);
    const row = () => page.getByRole("link").filter({ hasText: `latte ${run}` });
    const trail = async () =>
      (await call<{ items: unknown[] }>(request, "get", `/money/transactions?accountId=${wallet}&all=true`)).items.length;
    const onList = (url: URL) => url.pathname === "/apps/money/transactions";

    await page.goto(`/apps/money/transactions?account=${wallet}`);
    await row().click();
    await expect(page.locator("#mv-amount")).toHaveValue("5.00");
    const before = await trail();
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(onList);
    expect(await trail()).toBe(before); // nothing changed, nothing posted

    await row().click();
    await page.locator("#mv-amount").fill("6.50");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(onList);
    await expect(row()).toHaveCount(1);
    await expect(row()).toContainText("6.50");

    await row().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(onList);
    await expect(row()).toHaveCount(0);

    // the history keeps the first version, read-only, with the way to what replaced it
    await page.getByLabel("Show corrections and reversals (the whole trail)").check();
    // the first version: an expense of 5.00 (its reversal, on the same day, is a correction)
    await row().filter({ hasText: "Expense" }).filter({ hasText: "5.00" }).click();
    await expect(page.getByText("Changed later: this version no longer counts.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  });

  test("quick entry: N on any money page, the amount first, a note brings back its category and account", async ({ page, request }) => {
    const wallet = (await account(request, `Wallet ${run}`, "200.00")).id;
    const card = (await account(request, `Card ${run}`, "500.00")).id;
    const groceries = (await call<{ id: string; name: string }[]>(request, "get", "/money/categories")).find((c) => c.name === "Groceries")!;
    await expense(request, wallet, "8.00", `Bakery ${run}`, groceries.id);
    await expense(request, card, "1.00", `gum ${run}`);

    await page.goto(`/apps/money/accounts/${card}`);
    await page.keyboard.press("n");
    const sheet = page.getByRole("dialog", { name: "New movement" });
    await expect(sheet.getByLabel("Amount", { exact: true })).toBeFocused();
    await page.keyboard.type("6.50");
    await sheet.getByLabel("What for").fill(`Bakery ${run}`.slice(0, -1));
    await sheet.getByRole("option", { name: new RegExp(`Bakery ${run}`) }).click();
    // what it was last time: Groceries, from the wallet; the amount typed stays
    await expect(sheet.getByRole("group", { name: "Category" }).getByRole("button", { name: "Groceries" })).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.getByRole("group", { name: "Account" }).getByRole("button", { name: `Wallet ${run}` })).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.getByLabel("Amount", { exact: true })).toHaveValue("6.50");
    await sheet.getByLabel("What for").press("Enter");
    await expect(sheet).toBeHidden();
    await expect(page.getByText(`Saved: Bakery ${run}`)).toBeVisible();

    const saved = await call<{ items: { category: { name: string } | null }[] }>(
      request,
      "get",
      `/money/transactions?accountId=${wallet}&q=${encodeURIComponent(`Bakery ${run}`)}`
    );
    expect(saved.items.map((t) => t.category?.name)).toEqual(["Groceries", "Groceries"]);
  });

  test("quick entry saves another and keeps the form; undo takes a saved one back", async ({ page, request }) => {
    const wallet = (await account(request, `Tram ${run}`, "50.00")).id;
    const tram = () => call<{ items: unknown[] }>(request, "get", `/money/transactions?accountId=${wallet}&q=${encodeURIComponent(`tram ${run}`)}`);

    await page.goto(`/apps/money/accounts/${wallet}`);
    await page.getByRole("button", { name: "Movement", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "New movement" });
    await sheet.getByLabel("Amount", { exact: true }).fill("3.40");
    await sheet.getByLabel("What for").fill(`tram ${run}`);
    await sheet.getByRole("button", { name: "Save and add another" }).click();
    await expect(sheet.getByLabel("Amount", { exact: true })).toHaveValue("");
    await expect(sheet.getByLabel("Amount", { exact: true })).toBeFocused();
    await expect(sheet.getByRole("group", { name: "Account" }).getByRole("button", { name: `Tram ${run}` })).toHaveAttribute("aria-pressed", "true");
    expect((await tram()).items).toHaveLength(1);

    // the toast's Undo, with the form still open for the next one
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone: it no longer counts")).toBeVisible();
    await expect(sheet).toBeVisible();
    expect((await tram()).items).toHaveLength(0);
  });

  test("several movements at once: a category for all of them, then deleting them", async ({ page, request }) => {
    const wallet = (await account(request, `Bulk ${run}`, "100.00")).id;
    for (const n of ["one", "two", "three"]) await expense(request, wallet, "1.00", `${n} ${run}`);
    const row = (n: string) => page.getByRole("listitem").filter({ hasText: `${n} ${run}` });
    const pick = (n: string) => page.getByRole("checkbox", { name: `Pick ${n} ${run}` }).check();

    await page.goto(`/apps/money/transactions?account=${wallet}`);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await pick("one");
    await pick("two");
    await page.getByRole("combobox", { name: "Set category" }).click();
    await page.getByRole("option", { name: "Leisure", exact: true }).click();
    await expect(page.getByText("2 movements moved to Leisure")).toBeVisible();
    await expect(row("one")).toContainText("Leisure");
    await expect(row("two")).toContainText("Leisure");
    await expect(row("three")).toContainText("Other expenses");

    await pick("one");
    await pick("two");
    await page.getByRole("toolbar", { name: "Picked movements" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("2 movements deleted")).toBeVisible();
    await expect(row("one")).toHaveCount(0);
    await expect(row("two")).toHaveCount(0);
    await expect(row("three")).toHaveCount(1);
  });

  test("insights: from the pace under the Overview's expenses to this month on pace, as the forecast says", async ({ page, request }) => {
    const wallet = (await account(request, `Pace ${run}`, "1000.00")).id;
    const today = new Date().toISOString().slice(0, 10);
    await call(request, "post", "/money/movements", { kind: "expense", input: { date: today, accountId: wallet, currency: "PLN", amount: "12.34", note: `pace ${run}` } });
    // three months behind at least, so net worth has a pace ahead
    const back = new Date();
    back.setUTCMonth(back.getUTCMonth() - 3, 1);
    const before = back.toISOString().slice(0, 10);
    await call(request, "post", "/money/movements", { kind: "expense", input: { date: before, accountId: wallet, currency: "PLN", amount: "1.00", note: `pace before ${run}` } });
    const forecast = await call<{ daysInMonth: number; expenses: { projected: { value: string } }; netWorth: { months: unknown[]; expectedReturn: string } }>(
      request,
      "get",
      "/money/views/forecast"
    );
    const shown = (value: string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    await page.goto("/apps/money");
    const note = page.getByRole("link", { name: /^on pace for/ });
    await expect(note).toContainText(shown(forecast.expenses.projected.value));
    await note.click();
    await page.waitForURL(/\/apps\/money\/insights/);
    await expect(page.getByText("Spending this month").locator("..")).toContainText(shown(forecast.expenses.projected.value));

    // the chart's table: a row for every day of the month, and its header
    const chart = page.locator("figure").filter({ hasText: "Spending, day by day" });
    await chart.getByRole("button", { name: "Table" }).click();
    await expect(chart.getByRole("row")).toHaveCount(forecast.daysInMonth + 1);

    // what moved net worth, month by month: a row a month
    const months = page.locator("figure").filter({ hasText: "Month by month" });
    await months.getByRole("button", { name: "Table" }).click();
    await expect(months.getByRole("row")).toHaveCount(forecast.netWorth.months.length + 1);

    // the return investments are expected to earn: chosen where it shows, kept in the settings
    const rate = forecast.netWorth.expectedReturn === "4" ? "5" : "4";
    await page.getByLabel(/grow at/).click();
    await page.getByRole("option", { name: `${rate}% a year` }).click();
    await expect(page.getByText(`Investments now grow at ${rate}% a year`)).toBeVisible();
    expect((await call<{ expectedReturn: string }>(request, "get", "/money/settings")).expectedReturn).toBe(rate);

    // the months every projection learns from (things change: a tax begins): a common range from the
    // panel, then a custom one picked as its first and last month, kept and named; then back
    type Learning = { forecastRange: string; forecastSince: string | null; forecastUntil: string | null };
    const learning = () => call<Learning>(request, "get", "/money/settings");
    const learnFrom = page.getByRole("button", { name: /^Learn from/ });
    await learnFrom.click();
    await page.getByRole("button", { name: "Last 3 months", exact: true }).click();
    await expect(page.getByText("Insights now learn from your last 3 months")).toBeVisible();
    expect((await learning()).forecastRange).toBe("last_3_months");
    await expect(learnFrom).toContainText("Last 3 months");
    await expect(page.getByText(/your last 3 months/).first()).toBeVisible();

    // from the month three months back to last month: open at its end, so new months join
    const monthName = (d: Date) => d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 1);
    await learnFrom.click();
    await page.getByRole("button", { name: monthName(back), exact: true }).click();
    await page.getByRole("button", { name: monthName(lastMonth), exact: true }).click();
    await expect(page.getByText(/^Insights now learn from .* to now$/)).toBeVisible();
    expect(await learning()).toMatchObject({ forecastRange: "custom", forecastSince: before.slice(0, 7), forecastUntil: null });
    await expect(learnFrom).toContainText("now");
    await expect(page.getByText(/your 3 months since/).first()).toBeVisible();

    await learnFrom.click();
    await page.getByRole("button", { name: "Last 12 months", exact: true }).click();
    await expect(page.getByText("Insights now learn from your last 12 months")).toBeVisible();
    expect((await learning()).forecastRange).toBe("last_12_months");
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
