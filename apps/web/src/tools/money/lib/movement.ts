import type { Movement, MovementKind, TransactionResponse } from "../types";

const abs = (value: string) => value.replace(/^-/, "");

/**
 * The movement a posted transaction came from, for the correction form: the
 * proposal of an approved draft, or rebuilt from the entries. Undefined when the
 * transaction is not something a form can produce (a reversal, a split).
 */
export function movementFromTransaction(tx: TransactionResponse): Movement | undefined {
  if (tx.draft) return { kind: tx.draft.kind, input: { ...tx.draft.input, date: tx.date } };
  const base: Record<string, unknown> = { date: tx.date, ...(tx.note ? { note: tx.note } : {}) };
  const own = tx.entries.filter((e) => e.accountType !== "system");
  const income = tx.entries.find((e) => e.systemRole === "income");
  const expense = tx.entries.find((e) => e.systemRole === "expense");
  const kind = tx.kind as MovementKind;

  switch (tx.kind) {
    case "income": {
      const leg = own[0];
      if (!leg?.amount) return undefined;
      return {
        kind,
        input: { ...base, accountId: leg.accountId, currency: leg.amount.currency, amount: abs(leg.amount.value), categoryId: income?.categoryId ?? undefined },
      };
    }
    case "expense":
    case "fee": {
      const leg = own[0];
      if (!leg?.amount) return undefined;
      return {
        kind,
        input: { ...base, accountId: leg.accountId, currency: leg.amount.currency, amount: abs(leg.amount.value), categoryId: expense?.categoryId ?? undefined },
      };
    }
    case "opening_balance": {
      const leg = own[0];
      if (!leg?.amount) return undefined;
      return { kind, input: { ...base, accountId: leg.accountId, currency: leg.amount.currency, amount: leg.amount.value } };
    }
    case "transfer": {
      const out = own.find((e) => e.amount && e.amount.value.startsWith("-"));
      const into = own.find((e) => e.amount && !e.amount.value.startsWith("-"));
      if (!out?.amount || !into?.amount) return undefined;
      const input: Record<string, unknown> = {
        ...base,
        fromAccountId: out.accountId,
        fromCurrency: out.amount.currency,
        amountOut: abs(out.amount.value),
        toAccountId: into.accountId,
        toCurrency: into.amount.currency,
      };
      if (expense?.amount) input.fee = expense.amount.value;
      if (into.amount.currency !== out.amount.currency) input.amountIn = into.amount.value;
      return { kind, input };
    }
    default:
      return undefined;
  }
}
