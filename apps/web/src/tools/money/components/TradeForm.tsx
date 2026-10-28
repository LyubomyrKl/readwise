"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { divide } from "../lib/decimal";
import { formatUnits, normalizeAmountInput, today } from "../lib/format";
import { errorMessage, useAccounts, useAssets, usePositions } from "../queries";
import type { Movement, MovementKind, TransactionResponse } from "../types";
import {
  AccountSelect,
  accountCurrencies,
  AmountInput,
  CurrencySelect,
  DateInput,
  Field,
  Segmented,
  SimpleSelect,
} from "./Fields";

export type TradeKind = "buy" | "sell" | "investment_income" | "unit_move" | "split";

export const TRADE_KINDS: { value: TradeKind; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "investment_income", label: "Dividend / interest" },
  { value: "unit_move", label: "Move units" },
  { value: "split", label: "Split" },
];

const AMOUNT_RE = /^\d+(\.\d+)?$/;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function AssetSelect({
  id,
  value,
  onChange,
  only,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** restrict to these asset ids (e.g. what an account holds) */
  only?: string[];
}) {
  const { data: assets } = useAssets();
  const list = (assets ?? []).filter((a) => !only || only.includes(a.id));
  return (
    <SimpleSelect
      id={id}
      value={value}
      onChange={onChange}
      placeholder={list.length === 0 ? "No assets yet" : "Asset"}
      options={list.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
    />
  );
}

/**
 * Buy, sell, dividend or interest, unit move and split. Like the money form it
 * only collects strings; the API parses, checks and posts (with the lots).
 */
export function TradeForm<T = TransactionResponse>({
  initial,
  initialKind = "buy",
  accountId,
  lockKind = false,
  template = false,
  kinds = TRADE_KINDS,
  submitLabel = "Save",
  onSubmit,
  onDone,
}: {
  initial?: Movement;
  initialKind?: TradeKind;
  accountId?: string;
  lockKind?: boolean;
  /** a recurring movement: no date; the units may wait for the approval of each draft */
  template?: boolean;
  kinds?: { value: TradeKind; label: string }[];
  submitLabel?: string;
  onSubmit: (movement: Movement) => Promise<T>;
  onDone?: (result: T) => void;
}) {
  const i = initial?.input ?? {};
  const [kind, setKind] = useState<TradeKind>((initial?.kind as TradeKind | undefined) ?? initialKind);
  const [date, setDate] = useState(str(i.date) || today());
  const [note, setNote] = useState(str(i.note));
  const [account, setAccount] = useState(str(i.accountId) || str(i.fromAccountId) || accountId || "");
  const [asset, setAsset] = useState(str(i.assetId));
  const [units, setUnits] = useState(str(i.units));
  const [money, setMoney] = useState(str(i.total) || str(i.proceeds) || str(i.amount));
  const [currency, setCurrency] = useState(str(i.currency));
  const [other, setOther] = useState(str(i.paidFromAccountId) || str(i.proceedsToAccountId) || str(i.toAccountId));
  const [heldBefore, setHeldBefore] = useState(i.heldBefore === true);
  const [tradeAmount, setTradeAmount] = useState(str(i.tradeAmount));
  const [tradeCurrency, setTradeCurrency] = useState(str(i.tradeCurrency));
  const [withholding, setWithholding] = useState(str(i.withholding));
  const [incomeType, setIncomeType] = useState<"dividend" | "interest" | "other">(
    (str(i.incomeType) as "dividend" | "interest" | "other") || "dividend"
  );
  const [ratioFrom, setRatioFrom] = useState(str(i.ratioFrom) || "1");
  const [ratioTo, setRatioTo] = useState(str(i.ratioTo));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data: accounts } = useAccounts();
  const { data: assets } = useAssets();
  const { data: positions } = usePositions();
  const selectedAsset = assets?.find((a) => a.id === asset);
  const cashAccount = accounts?.find((a) => a.id === (kind === "buy" || kind === "sell" ? other || account : account));
  const held = positions?.find((p) => p.accountId === account && p.assetId === asset);
  const heldHere = (positions ?? []).filter((p) => p.accountId === account).map((p) => p.assetId);

  // the currency follows the paying (or receiving) account, the asset's quote currency first
  useEffect(() => {
    if (kind === "split" || kind === "unit_move") return;
    const list = accountCurrencies(cashAccount);
    if (list.length === 0) return;
    if (!currency || !list.includes(currency)) {
      setCurrency(selectedAsset && list.includes(selectedAsset.quoteCurrency) ? selectedAsset.quoteCurrency : list[0]);
    }
  }, [cashAccount, selectedAsset, currency, kind]);

  const unitPrice = (kind === "buy" || kind === "sell") && units && money ? divide(normalizeAmountInput(money), normalizeAmountInput(units), 4) : null;

  function build(): Movement | string {
    const base: Record<string, unknown> = { ...(template ? {} : { date }), ...(note.trim() ? { note: note.trim() } : {}) };
    const u = normalizeAmountInput(units);
    const m = normalizeAmountInput(money);
    if (!template && !date) return "Pick a date";
    switch (kind) {
      case "buy":
      case "sell": {
        if (!account) return "Pick the account that holds the units";
        if (!asset) return "Pick the asset";
        if (!(template && !u) && !AMOUNT_RE.test(u)) return "Enter the units";
        if (!AMOUNT_RE.test(m)) return kind === "buy" ? "Enter the total paid" : "Enter the proceeds";
        if (!currency) return "Pick the currency";
        const input: Record<string, unknown> = { ...base, accountId: account, assetId: asset, ...(u ? { units: u } : {}), currency };
        if (kind === "buy") {
          input.total = m;
          if (heldBefore) input.heldBefore = true;
          else if (other && other !== account) input.paidFromAccountId = other;
          if (tradeAmount && tradeCurrency) {
            input.tradeAmount = normalizeAmountInput(tradeAmount);
            input.tradeCurrency = tradeCurrency;
          }
        } else {
          input.proceeds = m;
          if (other && other !== account) input.proceedsToAccountId = other;
        }
        return { kind, input };
      }
      case "investment_income": {
        if (!account) return "Pick the account";
        if (!currency) return "Pick the currency";
        if (!AMOUNT_RE.test(m)) return "Enter the amount received";
        const input: Record<string, unknown> = { ...base, accountId: account, currency, amount: m, incomeType };
        if (withholding) input.withholding = normalizeAmountInput(withholding);
        if (asset) input.assetId = asset;
        return { kind, input };
      }
      case "unit_move": {
        if (!account || !other) return "Pick both accounts";
        if (!asset) return "Pick the asset";
        if (!AMOUNT_RE.test(u)) return "Enter the units";
        return { kind, input: { ...base, fromAccountId: account, toAccountId: other, assetId: asset, units: u } };
      }
      case "split": {
        if (!asset) return "Pick the asset";
        if (!/^\d+$/.test(ratioFrom) || !/^\d+$/.test(ratioTo)) return "Enter the ratio as two whole numbers";
        return { kind, input: { ...base, assetId: asset, ratioFrom, ratioTo } };
      }
    }
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
      // awaited first: in onDone?.(await onSubmit(…)) a missing onDone would skip the submit too
      const result = await onSubmit({ kind: movement.kind as MovementKind, input: movement.input });
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
      {lockKind ? null : <Segmented value={kind} onChange={setKind} options={kinds} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {template ? null : (
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
        )}
        {kind === "split" ? null : (
          <Field label={kind === "unit_move" ? "From account" : "Account"} hint={kind === "buy" ? "Where the units are held" : undefined}>
            <AccountSelect value={account} onChange={setAccount} />
          </Field>
        )}
      </div>

      {kind === "investment_income" ? (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
          <Field label="Currency">
            <CurrencySelect value={currency} onChange={setCurrency} only={accountCurrencies(cashAccount)} />
          </Field>
          <Field label="Amount received" hint="After tax withheld">
            <AmountInput value={money} onChange={setMoney} />
          </Field>
          <Field label="Tax withheld" hint="Optional">
            <AmountInput value={withholding} onChange={setWithholding} />
          </Field>
          <Field label="Kind">
            <SimpleSelect
              value={incomeType}
              onChange={setIncomeType}
              options={[
                { value: "dividend", label: "Dividend" },
                { value: "interest", label: "Interest" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
          <Field label="Paid by" hint="Optional">
            <AssetSelect value={asset} onChange={setAsset} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asset">
            <AssetSelect value={asset} onChange={setAsset} only={kind === "sell" || kind === "unit_move" ? heldHere : undefined} />
          </Field>
          {kind === "split" ? (
            <Field label="Ratio" hint="Every N units before become M after (1 → 3 triples them)">
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" value={ratioFrom} onChange={(e) => setRatioFrom(e.target.value.replace(/\D/g, ""))} />
                <span className="text-muted-foreground">→</span>
                <Input inputMode="numeric" value={ratioTo} onChange={(e) => setRatioTo(e.target.value.replace(/\D/g, ""))} />
              </div>
            </Field>
          ) : (
            <Field
              label={selectedAsset && selectedAsset.unitName !== "units" ? `Units (${selectedAsset.unitName})` : "Units"}
              hint={template ? "Leave empty to fill in on each approval" : held && kind !== "buy" ? `Held: ${formatUnits(held.units)}` : undefined}
            >
              <AmountInput value={units} onChange={setUnits} placeholder="0" />
            </Field>
          )}
        </div>
      )}

      {kind === "buy" || kind === "sell" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_1fr]">
            <Field label={kind === "buy" ? "Paid from" : "Proceeds to"} hint={kind === "buy" ? "Default: the same account" : "Default: the same account"}>
              <AccountSelect value={other || account} onChange={setOther} />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} only={heldBefore ? undefined : accountCurrencies(cashAccount)} />
            </Field>
            <Field
              label={kind === "buy" ? "Total paid" : "Proceeds"}
              hint={
                unitPrice
                  ? `${unitPrice} ${currency} per unit${kind === "buy" ? ", fees included" : ", after fees"}`
                  : kind === "buy"
                    ? "Price times units plus every fee"
                    : "What arrived, after fees"
              }
            >
              <AmountInput value={money} onChange={setMoney} />
            </Field>
          </div>
          {kind === "buy" ? (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={heldBefore} onChange={(e) => setHeldBefore(e.target.checked)} />
                Held before tracking started (no cash moves; the total is what they cost)
              </label>
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <Field label="Trade currency" hint="Optional">
                  <CurrencySelect value={tradeCurrency} onChange={setTradeCurrency} placeholder="—" />
                </Field>
                <Field label="Broker charged" hint="When the trade was in another currency than the payment">
                  <AmountInput value={tradeAmount} onChange={setTradeAmount} />
                </Field>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {kind === "unit_move" ? (
        <Field label="To account">
          <AccountSelect value={other} onChange={setOther} filter={(a) => a.id !== account} />
        </Field>
      ) : null}

      <Field label="Note">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
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
