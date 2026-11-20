"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { moneyApi } from "../api";
import { holdsUnits } from "../lib/accounts";
import { EMPTY_NEW_ASSET, NEW_ASSET, newAssetInput, newAssetProblem, type NewAssetFields } from "../lib/assets";
import { add, divide, isPositiveDecimal, subtract } from "../lib/decimal";
import { formatUnits, formatValue, normalizeAmountInput, today } from "../lib/format";
import { errorMessage, useAccounts, useAssets, usePositions } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AccountResponse, Movement, MovementKind, TransactionResponse } from "../types";
import {
  AccountBalances,
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
  // a split on the API; rare, so last
  { value: "split", label: "Unit count change" },
];

/**
 * What a buy posts as its total (the fee is part of the cost, for tax) and a
 * sale as its proceeds (what arrives): exact decimal strings, null when an
 * input is not a number. An empty fee counts as none.
 */
export function tradeMoney(kind: "buy" | "sell", amount: string, fee: string): string | null {
  const f = fee.trim() ? fee : "0";
  return kind === "buy" ? add(amount, f) : subtract(amount, f);
}

const AMOUNT_RE = /^\d+(\.\d+)?$/;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function AssetSelect({
  id,
  value,
  onChange,
  only,
  allowNew = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** restrict to these asset ids (e.g. what an account holds) */
  only?: string[];
  /** offer "New asset…" last: the form then describes one to create */
  allowNew?: boolean;
}) {
  const { data: assets } = useAssets();
  const list = (assets ?? []).filter((a) => !only || only.includes(a.id));
  return (
    <SimpleSelect
      id={id}
      value={value}
      onChange={onChange}
      placeholder={allowNew ? "Pick one, or create a new asset" : list.length === 0 ? "No assets yet" : "Asset"}
      options={[
        ...list.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
        ...(allowNew ? [{ value: NEW_ASSET, label: "+ New asset…" }] : []),
      ]}
    />
  );
}

/** A new asset described in place: what it takes to hold it and know its value. */
function NewAssetBox({ value, onChange }: { value: NewAssetFields; onChange: (next: NewAssetFields) => void }) {
  const set = <K extends keyof NewAssetFields>(key: K, v: NewAssetFields[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <p className="text-xs text-muted-foreground">
        A new asset: created when you save, together with this holding. Bonds valued by a formula (like EDO) are set up under Assets
        and classes.
      </p>
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field label="Short name" hint="As it shows everywhere">
          <Input value={value.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="VWCE" />
        </Field>
        <Field label="Full name">
          <Input value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="Vanguard FTSE All-World" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field label="Price currency">
          <CurrencySelect value={value.currency} onChange={(v) => set("currency", v)} />
        </Field>
        <Field label="Its price">
          <Segmented
            value={value.pricing}
            onChange={(v) => set("pricing", v)}
            options={[
              { value: "feed", label: "Daily from the internet" },
              { value: "manual", label: "I enter prices" },
            ]}
          />
        </Field>
      </div>
      {value.pricing === "feed" ? (
        <Field label="Symbol at Yahoo Finance" hint="Search the fund on finance.yahoo.com; the price is fetched every evening">
          <Input value={value.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="VWCE.DE" />
        </Field>
      ) : null}
    </div>
  );
}

/**
 * Buy, sell, dividend or interest, unit move and unit count change (a split). Like the money form it
 * only collects strings; the API parses, checks and posts (with the lots).
 */
export function TradeForm<T = TransactionResponse>({
  initial,
  initialKind = "buy",
  accountId,
  initialAsset,
  lockKind = false,
  kinds = TRADE_KINDS,
  submitLabel = "Save",
  onSubmit,
  onDone,
}: {
  initial?: Movement;
  initialKind?: TradeKind;
  accountId?: string;
  /** preselect this asset (buy more of it, sell it) */
  initialAsset?: string;
  lockKind?: boolean;
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
  const [asset, setAsset] = useState(str(i.assetId) || initialAsset || "");
  const [newAsset, setNewAsset] = useState<NewAssetFields>(EMPTY_NEW_ASSET);
  /** "paid in another currency": rare, folded away */
  const [otherCurrency, setOtherCurrency] = useState(!!str(i.tradeAmount));
  const queryClient = useQueryClient();
  const [units, setUnits] = useState(str(i.units));
  const [money, setMoney] = useState(str(i.total) || str(i.proceeds) || str(i.amount));
  /** a buy's or sale's fee; the amount above it is before the fee */
  const [fee, setFee] = useState("");
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

  // units (and their dividends or interest) live in investment and bonds accounts; the cash side may be any account
  const unitKind = kind === "buy" || kind === "sell" || kind === "unit_move";
  const holderKind = unitKind || kind === "investment_income";
  const legacy = initial ? [str(i.accountId), str(i.fromAccountId), str(i.toAccountId)].filter(Boolean) : [];
  /** an account that may hold units (or did, in the movement being corrected) */
  const canHold = (a: AccountResponse) => holdsUnits(a) || legacy.includes(a.id);
  const noHolder = !!accounts && !accounts.some(holdsUnits) && holderKind;

  // a preselected cash account (opened from a bank account's page) pays or receives instead
  useEffect(() => {
    if (!holderKind || !account || !accounts) return;
    const current = accounts.find((a) => a.id === account);
    if (!current || canHold(current)) return;
    if ((kind === "buy" || kind === "sell") && !other) setOther(account);
    setAccount("");
  }, [holderKind, account, accounts, kind]);

  // only a buy creates an asset in place
  useEffect(() => {
    if (kind !== "buy" && asset === NEW_ASSET) setAsset("");
  }, [kind, asset]);

  // the currency follows the paying (or receiving) account, the asset's quote currency first
  useEffect(() => {
    if (kind === "split" || kind === "unit_move") return;
    const list = accountCurrencies(cashAccount);
    if (list.length === 0) return;
    if (!currency || !list.includes(currency)) {
      setCurrency(selectedAsset && list.includes(selectedAsset.quoteCurrency) ? selectedAsset.quoteCurrency : list[0]);
    }
  }, [cashAccount, selectedAsset, currency, kind]);

  const trading = kind === "buy" || kind === "sell";
  const unitPrice = trading && units && money ? divide(normalizeAmountInput(money), normalizeAmountInput(units), 4) : null;
  /** the total a buy posts, or the proceeds of a sale */
  const posted = trading && money ? tradeMoney(kind, normalizeAmountInput(money), normalizeAmountInput(fee)) : null;

  const holderOk = (id: string) => {
    const a = accounts?.find((x) => x.id === id);
    return !a || canHold(a);
  };

  /** `assetId`: the asset picked, or (for a new one) its id once created */
  function build(assetId: string = asset): Movement | string {
    const base: Record<string, unknown> = { date, ...(note.trim() ? { note: note.trim() } : {}) };
    const u = normalizeAmountInput(units);
    const m = normalizeAmountInput(money);
    if (!date) return "Pick a date";
    switch (kind) {
      case "buy":
      case "sell": {
        if (!account) return "Pick the account that holds the units";
        if (!holderOk(account)) return "Units are held in an investment or bonds account";
        if (!assetId) return "Pick the asset";
        if (!AMOUNT_RE.test(u)) return "Enter the units";
        if (!AMOUNT_RE.test(m)) return "Enter the amount";
        const f = normalizeAmountInput(fee);
        if (f && !AMOUNT_RE.test(f)) return "The fee is not an amount";
        const all = tradeMoney(kind, m, f);
        if (!all || !isPositiveDecimal(all)) return "The fee must be less than the amount";
        if (!currency) return "Pick the currency";
        const input: Record<string, unknown> = { ...base, accountId: account, assetId, units: u, currency };
        if (kind === "buy") {
          input.total = all;
          if (heldBefore) input.heldBefore = true;
          else if (other && other !== account) input.paidFromAccountId = other;
          if (tradeAmount && tradeCurrency) {
            input.tradeAmount = normalizeAmountInput(tradeAmount);
            input.tradeCurrency = tradeCurrency;
          }
        } else {
          input.proceeds = all;
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
        if (assetId) input.assetId = assetId;
        return { kind, input };
      }
      case "unit_move": {
        if (!account || !other) return "Pick both accounts";
        if (!holderOk(account) || !holderOk(other)) return "Units move between investment or bonds accounts";
        if (!assetId) return "Pick the asset";
        if (!AMOUNT_RE.test(u)) return "Enter the units";
        return { kind, input: { ...base, fromAccountId: account, toAccountId: other, assetId: assetId, units: u } };
      }
      case "split": {
        if (!assetId) return "Pick the asset";
        if (!/^\d+$/.test(ratioFrom) || !/^\d+$/.test(ratioTo)) return "Enter the ratio as two whole numbers";
        return { kind, input: { ...base, assetId: assetId, ratioFrom, ratioTo } };
      }
    }
  }

  async function submit() {
    setError(null);
    // a new asset is created only once the rest of the form is right, then the buy posts with it
    const creating = kind === "buy" && asset === NEW_ASSET;
    if (creating) {
      const problem = newAssetProblem(newAsset);
      if (problem) {
        setError(problem);
        return;
      }
    }
    const checked = build(creating ? "pending" : asset);
    if (typeof checked === "string") {
      setError(checked);
      return;
    }
    setPending(true);
    try {
      let movement = checked;
      if (creating) {
        const created = await moneyApi.assets.create(newAssetInput(newAsset));
        // picked from now on: a buy that fails after this does not create it twice
        setAsset(created.id);
        void queryClient.invalidateQueries({ queryKey: ["money", "assets"] });
        movement = build(created.id) as Movement;
      }
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

      {kind === "buy" ? (
        <div className="space-y-1.5">
          <Segmented
            value={heldBefore ? "owned" : "buying"}
            onChange={(v) => setHeldBefore(v === "owned")}
            options={[
              { value: "buying", label: "Buying now" },
              { value: "owned", label: "Already own them" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {heldBefore
              ? "Units you held before you started tracking: they join the account with what they cost; no money moves now."
              : "The money leaves an account (this one, or another you pick) and the units arrive in the account below."}
          </p>
        </div>
      ) : null}

      {kind === "split" ? (
        <p className="text-sm text-muted-foreground">
          When a fund turns each unit into several (e.g. 1 → 2), or several into one. You hold the same money; only the number of
          units changes.
        </p>
      ) : null}

      {noHolder ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Units are held in an investment or bonds account, and there is none yet.{" "}
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.accounts}>
            Create one
          </Link>
          .
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" hint={kind === "buy" && heldBefore ? "When you got them, or the day you start tracking them" : undefined}>
          <DateInput value={date} onChange={setDate} />
        </Field>
        {kind === "split" ? null : (
          <Field
            label={kind === "unit_move" ? "From account" : "Account"}
            hint={kind === "buy" ? "The investment or bonds account that holds them" : kind === "investment_income" ? "An investment or bonds account" : undefined}
          >
            <AccountSelect
              value={account}
              onChange={setAccount}
              filter={holderKind ? canHold : undefined}
              placeholder={noHolder ? "No investment account" : "Account"}
            />
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
            <AssetSelect
              value={asset}
              onChange={setAsset}
              only={kind === "sell" || kind === "unit_move" ? heldHere : undefined}
              allowNew={kind === "buy"}
            />
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
              hint={held && kind !== "buy" ? `Held: ${formatUnits(held.units)}` : undefined}
            >
              <AmountInput value={units} onChange={setUnits} placeholder="0" />
            </Field>
          )}
        </div>
      )}

      {kind === "buy" && asset === NEW_ASSET ? <NewAssetBox value={newAsset} onChange={setNewAsset} /> : null}

      {kind === "buy" || kind === "sell" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            {kind === "buy" && heldBefore ? (
              <p className="self-end pb-2 text-sm text-muted-foreground">No account pays: you already own them.</p>
            ) : (
              <Field
                label={kind === "buy" ? "Paid from" : "Proceeds to"}
                hint={
                  <>
                    Default: the same account
                    {cashAccount ? <AccountBalances account={cashAccount} currency={currency} /> : null}
                  </>
                }
              >
                <AccountSelect value={other || account} onChange={setOther} />
              </Field>
            )}
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={setCurrency} only={heldBefore ? undefined : accountCurrencies(cashAccount)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={kind === "buy" && heldBefore ? "What they cost" : "Amount"}
              hint={
                kind === "buy" && heldBefore
                  ? "In total, what you paid for them"
                  : unitPrice
                    ? `${unitPrice} ${currency} per unit, before the fee`
                    : "Price × units, before the fee"
              }
            >
              <AmountInput value={money} onChange={setMoney} />
            </Field>
            {kind === "buy" && heldBefore ? null : (
              <Field
                label={`Fee${currency ? ` (${currency})` : ""}`}
                hint={kind === "buy" ? "Optional; part of the cost for tax" : "Optional; taken from what arrives"}
              >
                <AmountInput value={fee} onChange={setFee} placeholder="0.00" />
              </Field>
            )}
          </div>
          {posted && currency ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{kind === "buy" ? (heldBefore ? "Cost" : "Total paid") : "You receive"}: </span>
              <span className="font-medium tabular-nums">{formatValue(posted, currency)}</span>
            </p>
          ) : null}
          {kind === "buy" && !heldBefore ? (
            otherCurrency ? (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_1fr]">
                <Field label="Trade currency">
                  <CurrencySelect value={tradeCurrency} onChange={setTradeCurrency} placeholder="—" />
                </Field>
                <Field label="Broker charged" hint="When the trade was in another currency than the payment">
                  <AmountInput value={tradeAmount} onChange={setTradeAmount} />
                </Field>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setOtherCurrency(true)}
              >
                The broker charged in another currency?
              </button>
            )
          ) : null}
        </>
      ) : null}

      {kind === "unit_move" ? (
        <Field label="To account">
          <AccountSelect value={other} onChange={setOther} filter={(a) => a.id !== account && canHold(a)} />
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
