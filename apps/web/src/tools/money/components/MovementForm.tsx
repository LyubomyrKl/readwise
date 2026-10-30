"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { add, divide, isPositiveDecimal, subtract } from "../lib/decimal";
import { normalizeAmountInput, today } from "../lib/format";
import { errorMessage, useAccounts, useMoneySettings } from "../queries";
import type { Movement, MovementKind, TransactionResponse } from "../types";
import {
  AccountSelect,
  accountCurrencies,
  AmountInput,
  CategorySelect,
  CurrencySelect,
  DateInput,
  Field,
  Segmented,
} from "./Fields";

export type CashKind = "expense" | "income" | "transfer" | "opening_balance" | "fee";

/** Every kind this form can show (corrections of older fees and opening balances included). */
export const CASH_KINDS: { value: CashKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "fee", label: "Fee" },
  { value: "opening_balance", label: "Opening balance" },
];

/**
 * The tabs of a new movement. A fee is an expense in the "Fees" category; an
 * opening balance is set on the account page.
 */
export const CASH_TABS: { value: CashKind; label: string }[] = CASH_KINDS.filter(
  (k) => k.value !== "fee" && k.value !== "opening_balance"
);

const AMOUNT_RE = /^\d+(\.\d+)?$/;
const SIGNED_RE = /^[+-]?\d+(\.\d+)?$/;

interface State {
  date: string;
  note: string;
  accountId: string;
  currency: string;
  amount: string;
  categoryId: string;
  fromAccountId: string;
  fromCurrency: string;
  amountOut: string;
  toAccountId: string;
  toCurrency: string;
  amountIn: string;
  fee: string;
  feeCategoryId: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function initialState(movement?: Movement, accountId?: string): State {
  const i = movement?.input ?? {};
  return {
    date: str(i.date) || today(),
    note: str(i.note),
    accountId: str(i.accountId) || accountId || "",
    currency: str(i.currency),
    amount: str(i.amount),
    categoryId: str(i.categoryId),
    fromAccountId: str(i.fromAccountId) || accountId || "",
    fromCurrency: str(i.fromCurrency),
    amountOut: str(i.amountOut),
    toAccountId: str(i.toAccountId),
    toCurrency: str(i.toCurrency),
    amountIn: str(i.amountIn),
    fee: str(i.fee),
    feeCategoryId: str(i.feeCategoryId),
  };
}

/**
 * Income, expense, transfer, fee and opening balance in one form. It only
 * collects strings; the API parses and checks every amount (rule 1).
 */
export function MovementForm<T = TransactionResponse>({
  initial,
  initialKind = "expense",
  accountId,
  lockKind = false,
  kinds = CASH_TABS,
  submitLabel = "Save",
  onSubmit,
  onDone,
}: {
  initial?: Movement;
  initialKind?: CashKind;
  /** preselect this account (an account page) */
  accountId?: string;
  lockKind?: boolean;
  kinds?: { value: CashKind; label: string }[];
  submitLabel?: string;
  onSubmit: (movement: Movement) => Promise<T>;
  onDone?: (result: T) => void;
}) {
  const [kind, setKind] = useState<CashKind>(
    (initial?.kind as CashKind | undefined) && CASH_KINDS.some((k) => k.value === initial?.kind)
      ? (initial!.kind as CashKind)
      : initialKind
  );
  const [s, setS] = useState<State>(() => initialState(initial, accountId));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { data: accounts } = useAccounts();
  const { data: settings } = useMoneySettings();
  const set = <K extends keyof State>(key: K, value: State[K]) => setS((prev) => ({ ...prev, [key]: value }));
  /** the base currency when the account holds it, else its first currency */
  const preferred = (list: string[]) => (settings && list.includes(settings.baseCurrency) ? settings.baseCurrency : list[0]);

  const account = accounts?.find((a) => a.id === s.accountId);
  const from = accounts?.find((a) => a.id === s.fromAccountId);
  const to = accounts?.find((a) => a.id === s.toAccountId);

  // default the currency to the account's first one when the account changes
  useEffect(() => {
    const list = accountCurrencies(account);
    if (list.length > 0 && !list.includes(s.currency)) set("currency", preferred(list));
  }, [account, s.currency, settings]);
  useEffect(() => {
    const list = accountCurrencies(from);
    if (list.length > 0 && !list.includes(s.fromCurrency)) set("fromCurrency", preferred(list));
  }, [from, s.fromCurrency, settings]);
  useEffect(() => {
    const list = accountCurrencies(to);
    if (list.length === 0) return;
    if (!list.includes(s.toCurrency)) set("toCurrency", list.includes(s.fromCurrency) ? s.fromCurrency : preferred(list));
  }, [to, s.toCurrency, s.fromCurrency, settings]);

  const crossCurrency = kind === "transfer" && !!s.toCurrency && s.toCurrency !== s.fromCurrency;
  const out = normalizeAmountInput(s.amountOut);
  const fee = normalizeAmountInput(s.fee) || "0";
  const sentNet = useMemo(() => (out ? subtract(out, fee) : null), [out, fee]);
  const amount = normalizeAmountInput(s.amount);
  /** an expense's fee comes on top of the amount */
  const expenseTotal = kind === "expense" && s.fee && amount ? add(amount, fee) : null;
  const rate = crossCurrency && sentNet && s.amountIn ? divide(normalizeAmountInput(s.amountIn), sentNet, 6) : null;

  function build(): Movement | string {
    const base = { date: s.date, ...(s.note.trim() ? { note: s.note.trim() } : {}) };
    if (!s.date) return "Pick a date";
    if (kind === "transfer") {
      if (!s.fromAccountId || !s.toAccountId) return "Pick both accounts";
      if (!AMOUNT_RE.test(out)) return "Enter the amount sent";
      if (s.fee && !AMOUNT_RE.test(fee)) return "The fee is not an amount";
      const input: Record<string, unknown> = {
        ...base,
        fromAccountId: s.fromAccountId,
        fromCurrency: s.fromCurrency,
        amountOut: out,
        toAccountId: s.toAccountId,
        toCurrency: s.toCurrency || s.fromCurrency,
      };
      if (s.fee && fee !== "0") input.fee = fee;
      if (input.fee && s.feeCategoryId) input.feeCategoryId = s.feeCategoryId;
      if (sentNet && !isPositiveDecimal(sentNet)) return "The fee must be less than the amount sent";
      if (crossCurrency) {
        const received = normalizeAmountInput(s.amountIn);
        if (!AMOUNT_RE.test(received)) return "Enter the amount received";
        input.amountIn = received;
      }
      return { kind, input };
    }
    if (!s.accountId) return "Pick an account";
    if (!s.currency) return "Pick a currency";
    if (!(kind === "opening_balance" ? SIGNED_RE : AMOUNT_RE).test(amount)) return "Enter an amount";
    const input: Record<string, unknown> = { ...base, accountId: s.accountId, currency: s.currency, amount };
    if (kind !== "opening_balance" && s.categoryId) input.categoryId = s.categoryId;
    if (kind === "expense" && s.fee) {
      if (!AMOUNT_RE.test(fee)) return "The fee is not an amount";
      if (fee !== "0" && isPositiveDecimal(fee)) {
        input.fee = fee;
        if (s.feeCategoryId) input.feeCategoryId = s.feeCategoryId;
      }
    }
    return { kind: kind as MovementKind, input };
  }

  async function submit() {
    setError(null);
    const movement = build();
    if (typeof movement === "string") {
      setError(movement);
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit(movement);
      onDone?.(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {lockKind ? null : (
        <Segmented
          value={kind}
          onChange={(next) => {
            // a transfer's fee comes out of the amount, an expense's on top: not carried across
            if (next !== kind) setS((prev) => ({ ...prev, fee: "", feeCategoryId: "" }));
            setKind(next);
          }}
          options={kinds}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="mv-date">
          <DateInput id="mv-date" value={s.date} onChange={(v) => set("date", v)} />
        </Field>

        {kind === "transfer" ? null : (
          <Field label="Account" htmlFor="mv-account">
            <AccountSelect id="mv-account" value={s.accountId} onChange={(v) => set("accountId", v)} />
          </Field>
        )}
      </div>

      {kind === "transfer" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
            <Field label="From">
              <AccountSelect value={s.fromAccountId} onChange={(v) => set("fromAccountId", v)} />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={s.fromCurrency} onChange={(v) => set("fromCurrency", v)} only={accountCurrencies(from)} />
            </Field>
            <Field label="Amount sent" htmlFor="mv-out" hint="Everything that left the account, the fee included">
              <AmountInput id="mv-out" value={s.amountOut} onChange={(v) => set("amountOut", v)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
            <Field label="To">
              <AccountSelect value={s.toAccountId} onChange={(v) => set("toAccountId", v)} />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={s.toCurrency} onChange={(v) => set("toCurrency", v)} only={accountCurrencies(to)} />
            </Field>
            {crossCurrency ? (
              <Field
                label="Amount received"
                htmlFor="mv-in"
                hint={rate ? `Rate: 1 ${s.fromCurrency} = ${rate} ${s.toCurrency}` : "What arrived"}
              >
                <AmountInput id="mv-in" value={s.amountIn} onChange={(v) => set("amountIn", v)} />
              </Field>
            ) : (
              <Field label="Arrives" hint="The amount sent minus the fee">
                <Input value={sentNet ?? ""} disabled className="tabular-nums" />
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Fee${s.fromCurrency ? ` (${s.fromCurrency})` : ""}`} htmlFor="mv-fee" hint="Optional; taken from the amount sent">
              <AmountInput id="mv-fee" value={s.fee} onChange={(v) => set("fee", v)} placeholder="0.00" />
            </Field>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
          <Field label="Currency">
            <CurrencySelect value={s.currency} onChange={(v) => set("currency", v)} only={accountCurrencies(account)} />
          </Field>
          <Field
            label={kind === "opening_balance" ? "Balance" : "Amount"}
            htmlFor="mv-amount"
            hint={kind === "opening_balance" ? "Negative for money owed" : undefined}
          >
            <AmountInput
              id="mv-amount"
              value={s.amount}
              onChange={(v) => set("amount", v)}
              allowNegative={kind === "opening_balance"}
            />
          </Field>
          {kind === "opening_balance" ? null : (
            <Field label="Category">
              <CategorySelect
                kind={kind === "income" ? "income" : "expense"}
                value={s.categoryId}
                onChange={(v) => set("categoryId", v)}
              />
            </Field>
          )}
        </div>
      )}

      {kind === "expense" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`Fee${s.currency ? ` (${s.currency})` : ""}`}
            htmlFor="mv-expense-fee"
            hint={
              expenseTotal
                ? `Charged on top; booked under Fees. Total paid: ${expenseTotal}`
                : "Optional; charged on top, e.g. a card currency fee; booked under Fees"
            }
          >
            <AmountInput id="mv-expense-fee" value={s.fee} onChange={(v) => set("fee", v)} placeholder="0.00" />
          </Field>
        </div>
      ) : null}

      <Field label="Note" htmlFor="mv-note">
        <Textarea id="mv-note" rows={2} value={s.note} onChange={(e) => set("note", e.target.value)} />
      </Field>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
