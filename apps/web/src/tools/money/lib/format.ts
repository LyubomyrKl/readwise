import type { AmountJson } from "../types";

/**
 * Display formatting. Values stay exact decimal strings end to end: Intl.NumberFormat
 * formats a numeric string without converting it to a float first.
 */

type NumericString = `${number}` | string;

function exactFormat(nf: Intl.NumberFormat, value: NumericString): string {
  // Intl.NumberFormat.prototype.format accepts decimal strings exactly (ECMA-402, 2023)
  return (nf.format as (v: NumericString) => string)(value);
}

const currencyFormats = new Map<string, Intl.NumberFormat>();

function currencyFormat(currency: string, decimals: number, signDisplay: "auto" | "always" | "exceptZero") {
  const key = `${currency}/${decimals}/${signDisplay}`;
  let nf = currencyFormats.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay,
    });
    currencyFormats.set(key, nf);
  }
  return nf;
}

/** Decimal places of an exact value string ("12.30" -> 2). */
export function decimalsOf(value: string): number {
  const dot = value.indexOf(".");
  return dot < 0 ? 0 : value.length - dot - 1;
}

export function formatAmount(amount: AmountJson, opts: { signed?: boolean } = {}): string {
  return exactFormat(
    currencyFormat(amount.currency, decimalsOf(amount.value), opts.signed ? "exceptZero" : "auto"),
    amount.value
  );
}

/** A plain decimal string in a currency, e.g. a form value. */
export function formatValue(value: string, currency: string): string {
  return exactFormat(currencyFormat(currency, decimalsOf(value), "auto"), value);
}

const numberFormats = new Map<number, Intl.NumberFormat>();

/** An exact decimal string as a number with its own decimal places, no currency ("1234.50" -> "1,234.50"). */
export function formatNumber(value: string): string {
  const decimals = decimalsOf(value);
  let nf = numberFormats.get(decimals);
  if (!nf) {
    nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormats.set(decimals, nf);
  }
  return exactFormat(nf, value);
}

const unitsFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 });

export function formatUnits(units: string): string {
  return exactFormat(unitsFormat, units);
}

export function isNegative(value: string): boolean {
  return value.trim().startsWith("-") && /[1-9]/.test(value);
}

export function isZero(value: string): boolean {
  return !/[1-9]/.test(value);
}

/** "-12.30" -> "12.30" */
export function absValue(value: string): string {
  return value.replace(/^-/, "");
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFormat = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-10-28" -> "28 Oct 2026" in the browser's locale. */
export function formatDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

/** "2026-10" -> "October 2026" */
export function formatMonth(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

/** "2025-11", "2026-10" -> "Nov 2025 – Oct 2026"; one month alone when both are the same. */
export function formatMonthSpan(from: string, to: string): string {
  const short = (m: string) => shortMonthFormat.format(new Date(`${m}-01T00:00:00Z`));
  return from === to ? short(from) : `${short(from)} – ${short(to)}`;
}

/** Today as YYYY-MM-DD in the browser's time zone. */
export function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function percent(value: string, digits = 1): string {
  return `${exactFormat(new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }), value)}%`;
}

/** Normalizes what people type ("1 234,50") to the API's decimal format ("1234.50"). */
export function normalizeAmountInput(input: string): string {
  return input.replace(/[\s ']/g, "").replace(",", ".");
}

/** Normalizes a typed percentage ("80 %", "12,5%") to the API's decimal format ("80", "12.5"). */
export function normalizePercentInput(input: string): string {
  return input.replace(/[\s %]/g, "").replace(",", ".");
}

export const AMOUNT_INPUT_RE = /^\s*[+-]?[\d\s ']+(?:[.,]\d+)?\s*$/;
