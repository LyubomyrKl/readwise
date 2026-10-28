import { formatUnits, formatValue } from "./format";
import type { ImportProposal } from "../types";

/** One line for an import row: date, what it is, and the amount as the account sees it. */
export function describeProposal(
  p: ImportProposal,
  accountName: (id: string) => string
): { date: string; title: string; detail: string; amount: string; negative: boolean } {
  const i = p.input;
  const category = p.category ? (p.category.parent ? `${p.category.parent} / ${p.category.name}` : p.category.name) : "";
  switch (p.kind) {
    case "income":
      return { date: i.date, title: i.note || category || "Income", detail: [accountName(i.accountId), category].filter(Boolean).join(" · "), amount: `+${formatValue(i.amount, i.currency)}`, negative: false };
    case "expense":
    case "fee":
      return { date: i.date, title: i.note || category || "Expense", detail: [accountName(i.accountId), category].filter(Boolean).join(" · "), amount: `-${formatValue(i.amount, i.currency)}`, negative: true };
    case "transfer": {
      const received = i.amountIn ? ` → ${formatValue(i.amountIn, i.toCurrency)}` : "";
      return {
        date: i.date,
        title: i.note || "Transfer",
        detail: `${i.fromAccountId ? accountName(i.fromAccountId) : "another account"} → ${i.toAccountId ? accountName(i.toAccountId) : "another account"}${i.fee ? ` · fee ${formatValue(i.fee, i.fromCurrency)}` : ""}`,
        amount: `${formatValue(i.amountOut, i.fromCurrency)}${received}`,
        negative: false,
      };
    }
    case "buy":
      return { date: i.date, title: i.note || `Buy ${p.asset?.ticker ?? ""}`.trim(), detail: `${unitsText(i.units)} · ${accountName(i.accountId)}`, amount: `-${formatValue(i.total, i.currency)}`, negative: true };
    case "sell":
      return { date: i.date, title: i.note || `Sell ${p.asset?.ticker ?? ""}`.trim(), detail: `${unitsText(i.units)} · ${accountName(i.accountId)}`, amount: `+${formatValue(i.proceeds, i.currency)}`, negative: false };
    case "investment_income":
      return {
        date: i.date,
        title: i.note || category || "Investment income",
        detail: [accountName(i.accountId), p.asset?.ticker, i.withholding ? `${formatValue(i.withholding, i.currency)} tax withheld` : ""].filter(Boolean).join(" · "),
        amount: `+${formatValue(i.amount, i.currency)}`,
        negative: false,
      };
    default:
      return { date: i.date ?? "", title: i.note || p.kind, detail: "", amount: "", negative: false };
  }
}

function unitsText(units: string | undefined): string {
  return units ? `${formatUnits(units)} units` : "units on approval";
}
