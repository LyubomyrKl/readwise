import { barPath, labelEvery, monthBounds, niceScale, quarterLabel, shiftMonth } from "@tools/money/lib/chart";
import { divide, subtract } from "@tools/money/lib/decimal";
import { decimalsOf, formatAmount, formatMonthSpan, isNegative, normalizeAmountInput, normalizePercentInput } from "@tools/money/lib/format";
import { movementFromTransaction } from "@tools/money/lib/movement";
import { RANGE_TITLES, rangeFrom, suggestBases, trimLeadingEmpty } from "@tools/money/lib/views";
import type { TransactionResponse } from "@tools/money/types";

describe("money web helpers", () => {
  it("does exact decimal previews", () => {
    expect(subtract("1000.00", "2.00")).toBe("998.00");
    expect(subtract("0.1", "0.3")).toBe("-0.2");
    expect(divide("230.45", "998.00", 6)).toBe("0.230912");
    expect(divide("1", "3", 4)).toBe("0.3333");
    expect(divide("2", "3", 4)).toBe("0.6667");
    expect(divide("1", "0")).toBeNull();
    expect(divide("x", "1")).toBeNull();
  });

  it("formats amounts exactly, keeping the currency's places", () => {
    const formatted = formatAmount({ currency: "PLN", minor: "123456789012345678", value: "1234567890123456.78" });
    expect(formatted.replace(/\D/g, "")).toBe("123456789012345678");
    expect(decimalsOf("12.30")).toBe(2);
    expect(decimalsOf("1500")).toBe(0);
    expect(isNegative("-0.01")).toBe(true);
    expect(isNegative("-0.00")).toBe(false);
  });

  it("normalizes what people type", () => {
    expect(normalizeAmountInput("1 234,50")).toBe("1234.50");
    expect(normalizeAmountInput("1'000.5")).toBe("1000.5");
  });

  it("normalizes a typed percentage to what the API takes", () => {
    expect(normalizePercentInput("80%")).toBe("80");
    expect(normalizePercentInput(" 80 % ")).toBe("80");
    expect(normalizePercentInput("12,5%")).toBe("12.5");
    expect(normalizePercentInput("33.33")).toBe("33.33");
    expect(normalizePercentInput("%")).toBe("");
    expect(normalizePercentInput("")).toBe("");
  });

  it("names a range and its months for the period card", () => {
    expect(RANGE_TITLES).toEqual({ "12m": "Last 12 months", "3y": "Last 3 years", all: "All time" });
    const span = formatMonthSpan("2025-11", "2026-10");
    expect(span).toContain("2025");
    expect(span).toContain("2026");
    expect(span).toContain(" – ");
    expect(formatMonthSpan("2026-10", "2026-10")).not.toContain("–");
  });

  it("rebuilds a cross-currency transfer from its entries for a correction", () => {
    const tx = {
      id: "t",
      date: "2026-10-02",
      kind: "transfer",
      status: "posted",
      note: "To ZEN",
      draft: null,
      entries: [
        { accountId: "m", accountType: "bank", systemRole: null, amount: { currency: "PLN", minor: "-100000", value: "-1000.00" } },
        { accountId: "e", accountType: "system", systemRole: "expense", amount: { currency: "PLN", minor: "200", value: "2.00" } },
        { accountId: "c", accountType: "system", systemRole: "conversion", amount: { currency: "PLN", minor: "99800", value: "998.00" } },
        { accountId: "c", accountType: "system", systemRole: "conversion", amount: { currency: "EUR", minor: "-23045", value: "-230.45" } },
        { accountId: "z", accountType: "bank", systemRole: null, amount: { currency: "EUR", minor: "23045", value: "230.45" } },
      ],
    } as unknown as TransactionResponse;
    expect(movementFromTransaction(tx)).toEqual({
      kind: "transfer",
      input: {
        date: "2026-10-02",
        note: "To ZEN",
        fromAccountId: "m",
        fromCurrency: "PLN",
        amountOut: "1000.00",
        toAccountId: "z",
        toCurrency: "EUR",
        amountIn: "230.45",
        fee: "2.00",
      },
    });
  });
});

describe("import proposals", () => {
  it("describes each kind in one line", () => {
    const { describeProposal } = jest.requireActual<typeof import("@tools/money/lib/proposal")>("@tools/money/lib/proposal");
    const name = (id: string) => ({ a: "mBank", b: "ZEN" })[id] ?? "?";
    const transfer = describeProposal(
      { kind: "transfer", input: { date: "2026-10-03", fromAccountId: "a", fromCurrency: "PLN", amountOut: "1000.00", toAccountId: "b", toCurrency: "EUR", amountIn: "230.45" } },
      name
    );
    expect(transfer.detail).toBe("mBank → ZEN");
    expect(transfer.amount).toContain("1,000.00");
    const expense = describeProposal(
      { kind: "expense", input: { date: "2026-10-05", accountId: "a", currency: "PLN", amount: "45.99" }, category: { name: "Sklep", parent: "Jedzenie", kind: "expense" } },
      name
    );
    expect(expense).toMatchObject({ title: "Jedzenie / Sklep", negative: true });
  });
});

describe("money chart and view helpers", () => {
  it("rounds an axis out to steps that hold zero", () => {
    expect(niceScale([16622.86])).toEqual({ min: 0, max: 20000, ticks: [0, 5000, 10000, 15000, 20000] });
    expect(niceScale([-7857.14, 12000])).toEqual({ min: -10000, max: 15000, ticks: [-10000, -5000, 0, 5000, 10000, 15000] });
    expect(niceScale([63.1]).ticks).toEqual([0, 20, 40, 60, 80]);
    expect(niceScale([]).ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("labels as many points as fit, counting from the latest", () => {
    expect(labelEvery(12, 12)).toBe(1);
    expect(labelEvery(36, 8)).toBe(5);
    expect(labelEvery(5, 0)).toBe(5);
  });

  it("rounds a bar at its data end only", () => {
    expect(barPath(10, 20, 100, 40)).toBe("M10,100V44Q10,40 14,40H26Q30,40 30,44V100Z");
    expect(barPath(10, 20, 100, 102)).toBe("M10,100V100Q10,102 12,102H28Q30,102 30,100V100Z");
    expect(barPath(10, 20, 100, 100)).toBe("");
  });

  it("moves between months and quarters", () => {
    expect(shiftMonth("2026-10", -11)).toBe("2025-11");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(quarterLabel("2026-10-28")).toBe("Q4 2026");
    expect(rangeFrom("12m", "2026-10")).toBe("2025-11");
    expect(rangeFrom("3y", "2026-10")).toBe("2023-11");
    expect(rangeFrom("all", "2026-10")).toBe("start");
  });

  it("starts net worth history at the first month with something in it", () => {
    const zero = { currency: "PLN", minor: "0", value: "0.00" };
    const some = { currency: "PLN", minor: "100", value: "1.00" };
    const points = [
      { date: "2026-08-31", total: zero, assets: zero, liabilities: zero },
      { date: "2026-09-30", total: some, assets: some, liabilities: zero },
      { date: "2026-10-28", total: zero, assets: some, liabilities: { ...some, value: "-1.00", minor: "-100" } },
    ];
    expect(trimLeadingEmpty(points).map((p) => p.date)).toEqual(["2026-09-30", "2026-10-28"]);
    expect(trimLeadingEmpty([points[0]])).toHaveLength(1);
  });

  it("suggests the setting, then held currencies, as base currencies", () => {
    expect(suggestBases("PLN", ["PLN", "EUR", "USD", "GBP"])).toEqual(["PLN", "EUR", "USD", "GBP"]);
    expect(suggestBases(undefined, ["CHF"])).toEqual(["CHF", "EUR", "USD", "PLN"]);
  });
});
