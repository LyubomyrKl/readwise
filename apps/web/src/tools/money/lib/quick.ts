import type { HabitKind, HabitNote, Movement } from "../types";
import { isPositiveDecimal, subtract } from "./decimal";
import { normalizeAmountInput } from "./format";

/**
 * Quick entry, the part without a screen: what the history suggests for a note, which few
 * categories and accounts to offer as one-click chips, and the movement the fields make.
 */

const AMOUNT_RE = /^\d+(\.\d+)?$/;

/** The notes that match what is typed, case aside: those that start with it first, then those that contain it. */
export function matchNotes(notes: HabitNote[], typed: string, limit = 6): HabitNote[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const starts = notes.filter((n) => n.note.toLowerCase().startsWith(q));
  const contains = notes.filter((n) => !n.note.toLowerCase().startsWith(q) && n.note.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** The note typed exactly (case aside), when the history has it. */
export function exactNote(notes: HabitNote[], typed: string): HabitNote | undefined {
  const q = typed.trim().toLowerCase();
  return q ? notes.find((n) => n.note.toLowerCase() === q) : undefined;
}

/**
 * The few to offer as chips: the one picked first, then the most used, then the rest in their own
 * order while the history is short. Only ids still known (not archived, of the right kind) count.
 */
export function chipIds(used: string[], known: string[], picked: string, count: number): string[] {
  const out: string[] = [];
  const offer = (id: string) => {
    if (out.length < count && known.includes(id) && !out.includes(id)) out.push(id);
  };
  if (picked) offer(picked);
  used.forEach(offer);
  known.forEach(offer);
  return out;
}

/** "2026-11-20" moved by whole days, in the calendar (no time zone involved). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** What the quick form holds; a transfer reads account and currency as where the money comes from. */
export interface QuickFields {
  kind: HabitKind;
  date: string;
  note: string;
  amount: string;
  currency: string;
  accountId: string;
  categoryId: string;
  toAccountId: string;
  toCurrency: string;
  /** a transfer across currencies: what arrived */
  amountIn: string;
  /** an expense: charged on top; a transfer: taken from the amount sent */
  fee: string;
}

/** The movement the fields make, or what is missing (the API checks again, rule 1). */
export function quickMovement(f: QuickFields): Movement | string {
  const amount = normalizeAmountInput(f.amount);
  const fee = normalizeAmountInput(f.fee);
  if (!AMOUNT_RE.test(amount) || !isPositiveDecimal(amount)) return "Enter the amount";
  if (fee && !AMOUNT_RE.test(fee)) return "The fee is not an amount";
  if (!f.date) return "Pick a date";
  const base = { date: f.date, ...(f.note.trim() ? { note: f.note.trim() } : {}) };
  const withFee = !!fee && isPositiveDecimal(fee);

  if (f.kind === "transfer") {
    if (!f.accountId || !f.toAccountId) return "Pick where the money comes from and where it goes";
    if (!f.currency || !f.toCurrency) return "Pick the currencies";
    if (f.accountId === f.toAccountId && f.currency === f.toCurrency) return "Pick another account to move the money to";
    const input: Record<string, unknown> = {
      ...base,
      fromAccountId: f.accountId,
      fromCurrency: f.currency,
      amountOut: amount,
      toAccountId: f.toAccountId,
      toCurrency: f.toCurrency,
    };
    if (withFee) {
      const arrives = subtract(amount, fee);
      if (!arrives || !isPositiveDecimal(arrives)) return "The fee must be less than the amount sent";
      input.fee = fee;
    }
    if (f.toCurrency !== f.currency) {
      const received = normalizeAmountInput(f.amountIn);
      if (!AMOUNT_RE.test(received) || !isPositiveDecimal(received)) return "Enter the amount received";
      input.amountIn = received;
    }
    return { kind: "transfer", input };
  }

  if (!f.accountId) return "Pick an account";
  if (!f.currency) return "Pick a currency";
  const input: Record<string, unknown> = { ...base, accountId: f.accountId, currency: f.currency, amount };
  if (f.categoryId) input.categoryId = f.categoryId;
  if (f.kind === "expense" && withFee) input.fee = fee;
  return { kind: f.kind, input };
}
