"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, LineChart, Plus, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { moneyApi } from "../api";
import { Amount, Units } from "../components/Amount";
import { AmountInput, DateInput } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { formatDate, formatValue, normalizeAmountInput, today } from "../lib/format";
import { useAssets, useLots, useMoneyMutation, usePositions } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { PositionResponse } from "../types";

const VALUED_BY: Record<PositionResponse["valuedBy"], string> = {
  price: "price",
  bond_formula: "bond formula",
  cost: "at cost (no price yet)",
  none: "no value",
};

export default function InvestmentsPage() {
  const { data: positions, isLoading } = usePositions();
  const [pricing, setPricing] = useState(false);
  // one grid, the positions of an account next to each other; each card names its account
  const byAccount = new Map<string, PositionResponse[]>();
  for (const p of positions ?? []) byAccount.set(p.accountId, [...(byAccount.get(p.accountId) ?? []), p]);
  const sorted = [...byAccount.values()].flat();

  return (
    <MoneyPage>
      <PageHeader
        icon={LineChart}
        title="Investments"
        description="Positions at cost and at value; every buy is a lot, every sale takes the oldest first."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={MONEY_ROUTES.assets}>
                <Tag className="mr-1 h-4 w-4" /> Assets and classes
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setPricing(true)}>
              Update prices
            </Button>
            <Button asChild>
              <Link href={MONEY_ROUTES.newMovement("buy")}>
                <Plus className="mr-1 h-4 w-4" /> Buy
              </Link>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (positions ?? []).length === 0 ? (
        <EmptyState title="No positions yet">
          Create an asset under{" "}
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.assets}>
            Assets and classes
          </Link>
          , then record a buy.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          {sorted.map((p) => (
            <PositionCard key={`${p.accountId}-${p.assetId}`} position={p} />
          ))}
        </div>
      )}

      <Sheet open={pricing} onOpenChange={setPricing}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Update prices</SheetTitle>
            <SheetDescription>The quarterly checkpoint: one price per asset for a day.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <PricesForm onDone={() => setPricing(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </MoneyPage>
  );
}

function PositionCard({ position: p }: { position: PositionResponse }) {
  const [open, setOpen] = useState(false);
  const { data: lots } = useLots(p.accountId, p.assetId, open);
  const gainNegative = p.gain?.value.startsWith("-");
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <div className="truncate text-xs text-muted-foreground">{p.accountName}</div>
        <CardTitle className="flex items-start justify-between gap-2 text-base">
          <span className="min-w-0">
            <span className="block truncate">{p.code}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{p.name}</span>
          </span>
          <span className="text-right">
            <span className="block">{p.value ? <Amount amount={p.value} /> : <span className="text-muted-foreground">—</span>}</span>
            {p.gain ? (
              <span className={cn("block text-xs font-normal", gainNegative ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                <Amount amount={p.gain} signed muted /> {p.gainPercent ? `(${p.gainPercent}%)` : ""}
              </span>
            ) : null}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Units</dt>
          <dd className="text-right">
            <Units units={p.units} /> <span className="text-xs text-muted-foreground">{p.unitName}</span>
          </dd>
          <dt className="text-muted-foreground">Cost</dt>
          <dd className="text-right">
            {p.cost.map((c) => (
              <Amount key={c.currency} amount={c} className="block" />
            ))}
          </dd>
          {p.averageCost ? (
            <>
              <dt className="text-muted-foreground">Average cost</dt>
              <dd className="text-right tabular-nums">{formatValue(p.averageCost, p.cost[0].currency)}</dd>
            </>
          ) : null}
          {p.price ? (
            <>
              <dt className="text-muted-foreground">Price</dt>
              <dd className="text-right tabular-nums">
                {formatValue(p.price.price, p.price.currency)}
                <span className="block text-xs text-muted-foreground">{formatDate(p.price.date)}</span>
              </dd>
            </>
          ) : null}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Valued by {VALUED_BY[p.valuedBy]}</Badge>
          {p.estimated ? <Badge variant="outline">Inflation estimated</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" asChild>
            <Link href={`${MONEY_ROUTES.newMovement("buy")}&account=${p.accountId}`}>Buy</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`${MONEY_ROUTES.newMovement("sell")}&account=${p.accountId}`}>Sell</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
            {p.lots} {p.lots === 1 ? "lot" : "lots"}
          </Button>
        </div>
        {open ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Acquired</th>
                  <th className="px-2 py-1 text-right font-medium">Units left</th>
                  <th className="px-2 py-1 text-right font-medium">Cost left</th>
                  <th className="px-2 py-1 text-right font-medium">Cost in PLN</th>
                </tr>
              </thead>
              <tbody>
                {(lots ?? []).map((l) => (
                  <tr key={l.id} className={cn("border-t", l.closed && "text-muted-foreground line-through")}>
                    <td className="px-2 py-1">
                      <Link className="hover:underline" href={MONEY_ROUTES.transaction(l.transactionId)}>
                        {formatDate(l.acquiredAt)}
                      </Link>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Units units={l.remainingUnits} /> / <Units units={l.units} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Amount amount={l.remainingCost} muted />
                    </td>
                    <td className="px-2 py-1 text-right" title={l.costPlnRate ? `NBP ${l.costPlnRate} of ${l.costPlnRateDate}` : "no NBP rate stored yet"}>
                      {l.costPln ? <Amount amount={l.costPln} muted /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PricesForm({ onDone }: { onDone: () => void }) {
  const { data: assets } = useAssets();
  const priced = (assets ?? []).filter((a) => a.valuation !== "bond_formula");
  const [date, setDate] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});
  const save = useMoneyMutation(
    async () => {
      const entries = Object.entries(values).filter(([, v]) => v.trim());
      for (const [assetId, price] of entries) await moneyApi.prices.record({ assetId, date, price: normalizeAmountInput(price) });
      return entries.length;
    },
    { success: (n) => (n === 1 ? "1 price saved" : `${n} prices saved`), onSuccess: onDone }
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <div className="space-y-1.5">
        <div className="text-sm font-medium">Day</div>
        <DateInput value={date} onChange={setDate} />
      </div>
      {priced.length === 0 ? <p className="text-sm text-muted-foreground">No priced assets.</p> : null}
      {priced.map((a) => (
        <div key={a.id} className="grid grid-cols-[1fr_9rem] items-center gap-2">
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{a.code}</div>
            <div className="text-xs text-muted-foreground">
              {a.latestPrice ? `${formatValue(a.latestPrice.price, a.latestPrice.currency)} on ${formatDate(a.latestPrice.date)}` : "no price yet"}
            </div>
          </div>
          <AmountInput value={values[a.id] ?? ""} onChange={(v) => setValues((all) => ({ ...all, [a.id]: v }))} placeholder={a.quoteCurrency} />
        </div>
      ))}
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          Save prices
        </Button>
      </div>
    </form>
  );
}
