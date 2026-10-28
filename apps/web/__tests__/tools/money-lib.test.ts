import { divide, subtract } from "@tools/money/lib/decimal";
import { decimalsOf, formatAmount, isNegative, normalizeAmountInput } from "@tools/money/lib/format";
import { movementFromTransaction } from "@tools/money/lib/movement";
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
