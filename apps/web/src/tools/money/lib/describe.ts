import type { AmountJson, EntryResponse, TransactionKind, TransactionResponse } from "../types";

export const KIND_LABELS: Record<TransactionKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  opening_balance: "Opening balance",
  fee: "Fee",
  buy: "Buy",
  sell: "Sell",
  investment_income: "Investment income",
  unit_move: "Unit move",
  split: "Split",
  correction: "Correction",
};

export interface Leg {
  accountId: string;
  accountName: string;
  code: string;
  amount: AmountJson | null;
  units: string | null;
}

/** The own-account side of a transaction (system accounts are bookkeeping, not places money sits). */
export function ownLegs(tx: TransactionResponse): Leg[] {
  return tx.entries
    .filter((e) => e.accountType !== "system")
    .map((e: EntryResponse) => ({
      accountId: e.accountId,
      accountName: e.accountName,
      code: e.code,
      amount: e.amount,
      units: e.units,
    }));
}

/** Kinds whose category says what the money was for (on a transfer it is only the fee's). */
const CATEGORY_TITLED: TransactionKind[] = ["income", "expense", "fee", "investment_income"];

/** One line that says what happened: the note, else the category, else the kind (and asset). */
export function title(tx: TransactionResponse): string {
  if (tx.note) return tx.note;
  if (tx.category && CATEGORY_TITLED.includes(tx.kind)) return tx.category.name;
  if (tx.asset) return `${KIND_LABELS[tx.kind]} ${tx.asset.name}`;
  return KIND_LABELS[tx.kind];
}

/** Expense and income totals by category, from the entries on the system income/expense accounts. */
export function categoryLines(tx: TransactionResponse): { name: string; amount: AmountJson }[] {
  return tx.entries
    .filter((e) => (e.systemRole === "income" || e.systemRole === "expense") && e.amount)
    .map((e) => ({ name: e.categoryName ?? (e.systemRole === "income" ? "Income" : "Expense"), amount: e.amount! }));
}
