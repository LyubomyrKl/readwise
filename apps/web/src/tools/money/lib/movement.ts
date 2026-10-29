import type { Movement, MovementKind, TransactionResponse } from "../types";

const abs = (value: string) => value.replace(/^-/, "");

/**
 * The movement a posted transaction came from, for the correction form: the
 * input it was approved from (a former draft), or rebuilt from the entries. Undefined when the
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
    case "buy": {
      const units = own.find((e) => e.units && !e.units.startsWith("-"));
      const cash = tx.entries.find((e) => e.amount && e.amount.value.startsWith("-") && e.systemRole !== "conversion");
      if (!units || !cash?.amount || !tx.asset) return undefined;
      const input: Record<string, unknown> = {
        ...base,
        accountId: units.accountId,
        assetId: tx.asset.id,
        units: units.units,
        total: abs(cash.amount.value),
        currency: cash.amount.currency,
      };
      if (cash.systemRole === "opening_balance") input.heldBefore = true;
      else if (cash.accountId !== units.accountId) input.paidFromAccountId = cash.accountId;
      return { kind, input };
    }
    case "sell": {
      const units = own.find((e) => e.units && e.units.startsWith("-"));
      const cash = own.find((e) => e.amount && !e.amount.value.startsWith("-"));
      if (!units || !cash?.amount || !tx.asset) return undefined;
      const input: Record<string, unknown> = {
        ...base,
        accountId: units.accountId,
        assetId: tx.asset.id,
        units: abs(units.units!),
        proceeds: cash.amount.value,
        currency: cash.amount.currency,
      };
      if (cash.accountId !== units.accountId) input.proceedsToAccountId = cash.accountId;
      return { kind, input };
    }
    case "investment_income": {
      const leg = own[0];
      if (!leg?.amount) return undefined;
      const input: Record<string, unknown> = {
        ...base,
        accountId: leg.accountId,
        currency: leg.amount.currency,
        amount: leg.amount.value,
        incomeCategoryId: income?.categoryId ?? undefined,
      };
      if (expense?.amount) input.withholding = expense.amount.value;
      if (tx.asset) input.assetId = tx.asset.id;
      return { kind, input };
    }
    case "unit_move": {
      const out = own.find((e) => e.units?.startsWith("-"));
      const into = own.find((e) => e.units && !e.units.startsWith("-"));
      if (!out || !into || !tx.asset) return undefined;
      return { kind, input: { ...base, fromAccountId: out.accountId, toAccountId: into.accountId, assetId: tx.asset.id, units: into.units } };
    }
    default:
      return undefined;
  }
}
