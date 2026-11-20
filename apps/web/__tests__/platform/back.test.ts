import { previousIsInApp, type HistoryEntries } from "@platform/ui/BackLink";

const app = "https://workbench.example";

/** A tab's history as the Navigation API reports it: its pages, and the one shown (the last by default). */
const tab = (urls: string[], at = urls.length - 1): HistoryEntries => ({
  currentEntry: { index: at },
  entries: () => urls.map((url) => ({ url })),
});

describe("the back arrow", () => {
  it("goes back when the page before is one of the app's", () => {
    expect(previousIsInApp(tab([`${app}/apps/money`, `${app}/apps/money/accounts/acc_1`]), app)).toBe(true);
    // after going back once: the page before the shown one counts, not the last one
    const pages = [`${app}/apps/money`, `${app}/apps/money/accounts/acc_1`, `${app}/apps/money/transactions/tx_1`];
    expect(previousIsInApp(tab(pages, 1), app)).toBe(true);
  });

  it("goes up instead when going back would leave the app", () => {
    expect(previousIsInApp(undefined, app)).toBe(false); // a browser without the Navigation API
    expect(previousIsInApp(tab([`${app}/apps/money/accounts/acc_1`]), app)).toBe(false); // opened directly
    expect(previousIsInApp(tab([`${app}/apps/money`, `${app}/apps/money/accounts/acc_1`], 0), app)).toBe(false); // the first page
    expect(previousIsInApp(tab([`${app}/auth/login?next=%2Fapps%2Fmoney`, `${app}/apps/money`]), app)).toBe(false); // just signed in
    expect(previousIsInApp(tab(["https://elsewhere.example/", `${app}/apps/money`]), app)).toBe(false);
    expect(previousIsInApp({ currentEntry: null, entries: () => [] }, app)).toBe(false);
  });
});
