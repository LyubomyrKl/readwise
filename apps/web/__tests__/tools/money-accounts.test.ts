import {
  applyOrder,
  balancesFor,
  groupAccounts,
  holdsUnits,
  inAllocation,
  mergeBlocker,
  mergeCandidates,
  mergeNameGuess,
  pickableInstitutions,
} from "@tools/money/lib/accounts";
import { add, subtract } from "@tools/money/lib/decimal";
import { CASH_KINDS, CASH_TABS } from "@tools/money/components/MovementForm";
import { TRADE_KINDS, tradeMoney } from "@tools/money/components/TradeForm";
import { addHoldingHref, heldIn, holdingsByAccount, newAssetInput, newAssetProblem, type NewAssetFields } from "@tools/money/lib/assets";
import type { AccountResponse, InstitutionResponse, PositionResponse, SubAccountBalance } from "@tools/money/types";

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

describe("account order and balances in the forms", () => {
  const ids = (list: { id: string }[]) => list.map((a) => a.id);

  it("shows a new order at once; an account the order does not name keeps its place after", () => {
    const list = ["pko", "zen", "ibkr", "cash"].map((id) => account(id, null));
    expect(ids(applyOrder(list, null))).toEqual(["pko", "zen", "ibkr", "cash"]);
    expect(ids(applyOrder(list, ["ibkr", "pko", "zen"]))).toEqual(["ibkr", "pko", "zen", "cash"]);
    expect(ids(applyOrder(list, ["gone", "cash", "pko"]))).toEqual(["cash", "pko", "zen", "ibkr"]);
  });

  it("lists the cash an account holds under its picker, the currency in use first, no units", () => {
    const balance = (code: string, value: string | null, kind: SubAccountBalance["kind"] = "currency"): SubAccountBalance => ({
      subAccountId: code,
      commodityId: code,
      code,
      kind,
      balance: value === null ? null : { value, currency: code, minor: "0" },
      units: kind === "asset" ? "73" : null,
      number: null,
    });
    const mbank = { balances: [balance("PLN", "7637.71"), balance("USD", "1.50"), balance("VWCE", null, "asset")] };
    expect(balancesFor(mbank, "USD").map((b) => b.code)).toEqual(["USD", "PLN"]);
    expect(balancesFor(mbank, "PLN").map((b) => b.code)).toEqual(["PLN", "USD"]);
    expect(balancesFor(mbank).map((b) => b.code)).toEqual(["PLN", "USD"]);
    expect(balancesFor(undefined, "PLN")).toEqual([]);
  });
});

describe("what the allocation counts", () => {
  it("leaves debt and money lent out out of the allocation", () => {
    expect((["bank", "investment", "bonds"] as const).every((t) => inAllocation(t))).toBe(true);
    expect(inAllocation("debt")).toBe(false);
    expect(inAllocation("lent")).toBe(false);
  });
});

describe("holding an asset in an account", () => {
  const position = (accountId: string, assetId: string, units = "10") =>
    ({ accountId, accountName: accountId.toUpperCase(), assetId, units }) as PositionResponse;

  it("asks for what a new asset needs, and turns it into the API's input", () => {
    const fields: NewAssetFields = { code: "vwce", name: "All-World", currency: "EUR", pricing: "feed", symbol: "" };
    expect(newAssetProblem({ ...fields, code: " " })).toMatch(/short name/);
    expect(newAssetProblem(fields)).toMatch(/symbol/);
    expect(newAssetProblem({ ...fields, pricing: "manual" })).toBeNull();
    expect(newAssetInput({ ...fields, symbol: " VWCE.DE " })).toEqual({
      code: "VWCE",
      name: "All-World",
      quoteCurrency: "EUR",
      valuation: "price_feed",
      valuationConfig: { provider: "yahoo", symbol: "VWCE.DE" },
      ticker: "VWCE.DE",
    });
    expect(newAssetInput({ ...fields, pricing: "manual" })).toEqual({ code: "VWCE", name: "All-World", quoteCurrency: "EUR", valuation: "manual" });
  });

  it("lists every account that can hold units, the empty ones too, with what each holds", () => {
    const accounts = [account("ibkr", null, false, "investment"), account("edo", null, false, "bonds"), account("mbank", null), account("old", null, true, "investment")];
    const groups = holdingsByAccount(accounts, [position("ibkr", "vwce"), position("old", "spy")]);
    expect(groups.map((g) => [g.account.id, g.positions.map((p) => p.assetId)])).toEqual([
      ["ibkr", ["vwce"]],
      ["edo", []],
      ["old", ["spy"]], // archived, still holding
    ]);
    expect(heldIn("vwce", [position("ibkr", "vwce", "129"), position("xtb", "vwce", "3")])).toEqual([
      { accountId: "ibkr", accountName: "IBKR", units: "129" },
      { accountId: "xtb", accountName: "XTB", units: "3" },
    ]);
    expect(addHoldingHref("/apps/money/transactions/new?kind=buy", "ibkr", "vwce")).toBe("/apps/money/transactions/new?kind=buy&account=ibkr&asset=vwce");
  });
});
