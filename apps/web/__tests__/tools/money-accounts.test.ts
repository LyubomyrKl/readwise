import { groupAccounts, holdsUnits, mergeBlocker, mergeCandidates, mergeNameGuess, pickableInstitutions } from "@tools/money/lib/accounts";
import { add, subtract } from "@tools/money/lib/decimal";
import { CASH_KINDS, CASH_TABS } from "@tools/money/components/MovementForm";
import { TRADE_KINDS, tradeMoney } from "@tools/money/components/TradeForm";
import type { AccountResponse, InstitutionResponse } from "@tools/money/types";

const inst = (id: string, name = id): InstitutionResponse => ({ id, name, kind: "bank" });
const account = (id: string, institution: InstitutionResponse | null, archived = false, type: AccountResponse["type"] = "bank") =>
  ({ id, name: id, type, institution, archivedAt: archived ? "2026-01-01T00:00:00.000Z" : null }) as AccountResponse;

describe("money account helpers", () => {
  it("offers groups with no accounts or with an active one, not those with only archived accounts", () => {
    const fresh = inst("fresh");
    const active = inst("active");
    const mixed = inst("mixed");
    const gone = inst("gone");
    const accounts = [
      account("a1", active),
      account("m1", mixed, true),
      account("m2", mixed),
      account("g1", gone, true),
      account("g2", gone, true),
      account("loose", null, true),
    ];
    expect(pickableInstitutions([fresh, active, mixed, gone], accounts).map((i) => i.id)).toEqual(["fresh", "active", "mixed"]);
  });

  it("holds units only in investment and bonds accounts", () => {
    expect(holdsUnits({ type: "investment" })).toBe(true);
    expect(holdsUnits({ type: "bonds" })).toBe(true);
    expect(holdsUnits({ type: "bank" })).toBe(false);
    expect(holdsUnits({ type: "debt" })).toBe(false);
  });

  it("groups accounts in the order they come, accounts in no group last under Other", () => {
    const mbank = inst("m", "mBank");
    const ibkr = inst("i", "Interactive Brokers");
    const groups = groupAccounts([
      account("cash", null),
      account("pln", mbank),
      account("ibkr", ibkr),
      account("wallet", null),
      account("usd", mbank),
    ]);
    expect(groups.map(([name, list]) => [name, list.map((a) => a.id)])).toEqual([
      ["mBank", ["pln", "usd"]],
      ["Interactive Brokers", ["ibkr"]],
      ["Other", ["cash", "wallet"]],
    ]);
    expect(groupAccounts([account("pln", mbank)]).map(([name]) => name)).toEqual(["mBank"]);
  });

  it("adds and subtracts decimal strings exactly", () => {
    expect(add("0.1", "0.2")).toBe("0.3");
    expect(add("100", "3.50")).toBe("103.50");
    expect(add("1", "-1.25")).toBe("-0.25");
    expect(subtract("1000.00", "4.5")).toBe("995.50");
    expect(subtract("1", "1.000")).toBe("0.000");
    expect(add("12345678901234567890.12", "0.01")).toBe("12345678901234567890.13");
    expect(add("abc", "1")).toBeNull();
    expect(subtract("1", "")).toBeNull();
  });

  it("posts a buy's total with the fee and a sale's proceeds without it", () => {
    expect(tradeMoney("buy", "1000.00", "3")).toBe("1003.00");
    expect(tradeMoney("buy", "1000.00", "")).toBe("1000.00");
    expect(tradeMoney("sell", "1000.00", "2.5")).toBe("997.50");
    expect(tradeMoney("sell", "1000", " ")).toBe("1000");
    expect(tradeMoney("buy", "x", "1")).toBeNull();
  });

  it("lists the unit count change (a split) last among investment movements", () => {
    expect(TRADE_KINDS.at(-1)).toEqual({ value: "split", label: "Unit count change" });
  });

  it("offers expense, income and transfer as new movements; fees and opening balances stay editable", () => {
    expect(CASH_TABS.map((k) => k.value)).toEqual(["expense", "income", "transfer"]);
    expect(CASH_KINDS.map((k) => k.value)).toEqual(expect.arrayContaining(["fee", "opening_balance"]));
  });

  it("guesses the merged name from the words both names start with, else the target's", () => {
    expect(mergeNameGuess("mBank USD", "mBank PLN")).toBe("mBank");
    expect(mergeNameGuess("ZEN EUR", "ZEN")).toBe("ZEN");
    expect(mergeNameGuess("Cash - USD", "Cash - PLN")).toBe("Cash");
    expect(mergeNameGuess("PKO Konto2", "PKO Konto")).toBe("PKO");
    expect(mergeNameGuess("Revolut", "Revolt")).toBe("Revolt");
    expect(mergeNameGuess("Wallet", "Cash")).toBe("Cash");
  });

  it("offers same-type accounts to merge into, those sharing a currency disabled and last", () => {
    const bal = (code: string, kind: "currency" | "asset" = "currency") =>
      ({ subAccountId: code, commodityId: code, code, kind, balance: null, units: null, number: null }) as AccountResponse["balances"][number];
    const acc = (id: string, codes: string[], type: AccountResponse["type"] = "bank", archived = false) =>
      ({ ...account(id, null, archived, type), balances: codes.map((c) => bal(c)) }) as AccountResponse;
    const source = acc("usd", ["USD"]);
    const list = [source, acc("both", ["PLN", "USD"]), acc("pln", ["PLN"]), acc("broker", ["EUR"], "investment"), acc("old", ["EUR"], "bank", true)];
    expect(mergeCandidates(source, list).map((c) => [c.account.id, c.reason])).toEqual([
      ["pln", null],
      ["both", "Both hold USD"],
    ]);
    expect(mergeBlocker(source)).toBeNull();
    expect(mergeBlocker({ name: "IBKR", balances: [bal("EUR"), bal("VWCE", "asset")] })).toMatch(/holds units/);
  });
});
