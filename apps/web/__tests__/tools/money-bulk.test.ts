import { categoryKindOf, inCategory, pickable, sharedCategoryKind } from "@tools/money/lib/bulk";
import type { TransactionResponse } from "@tools/money/types";

const leg = (systemRole: string | null, value: string, categoryId: string | null = null) => ({
  id: `${systemRole}-${value}`,
  accountId: systemRole ? "system" : "mbank",
  accountType: systemRole ? "system" : "bank",
  systemRole,
  code: "PLN",
  amount: { currency: "PLN", value, minor: value.replace(/[-.]/g, "") },
  units: null,
  categoryId,
});
const tx = (kind: string, extra: Partial<TransactionResponse> = {}) =>
  ({
    id: kind,
    kind,
    date: "2026-11-02",
    note: "Lidl",
    status: "posted",
    reversedBy: null,
    draft: null,
    category: { id: "other", name: "Other expenses" },
    entries: [leg(null, "-12.00"), leg(kind === "income" ? "income" : "expense", "12.00", "other")],
    ...extra,
  }) as unknown as TransactionResponse;

describe("several movements at once", () => {
  it("puts expenses and fees in expense categories, income in income ones, and nothing else in any", () => {
    expect(categoryKindOf(tx("expense"))).toBe("expense");
    expect(categoryKindOf(tx("fee"))).toBe("expense");
    expect(categoryKindOf(tx("income"))).toBe("income");
    expect(categoryKindOf(tx("transfer"))).toBeNull();
    expect(sharedCategoryKind([tx("expense"), tx("fee")])).toBe("expense");
    expect(sharedCategoryKind([tx("expense"), tx("income")])).toBeNull();
    expect(sharedCategoryKind([tx("expense"), tx("transfer")])).toBeNull();
  });

  it("picks only what still counts", () => {
    expect(pickable(tx("expense"))).toBe(true);
    expect(pickable(tx("expense", { reversedBy: "r" }))).toBe(false);
    expect(pickable(tx("correction"))).toBe(false);
    expect(pickable(tx("expense", { status: "draft" }))).toBe(false);
  });

  it("rebuilds a movement in another category, and leaves one already there alone", () => {
    expect(inCategory(tx("expense"), "groceries")).toEqual({
      kind: "expense",
      input: { date: "2026-11-02", note: "Lidl", accountId: "mbank", currency: "PLN", amount: "12.00", categoryId: "groceries" },
    });
    expect(inCategory(tx("expense"), "other")).toBeNull();
    expect(inCategory(tx("transfer"), "groceries")).toBeNull();
  });
});
