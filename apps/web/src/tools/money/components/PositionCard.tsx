"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { addHoldingHref } from "../lib/assets";
import { formatDate, formatValue } from "../lib/format";
import { useLots } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { PositionResponse } from "../types";
import { Amount, Units } from "./Amount";

const VALUED_BY: Record<PositionResponse["valuedBy"], string> = {
  price: "price",
  bond_formula: "bond formula",
  cost: "cost (no price yet)",
  none: "no value",
};

/** One holding: what an account holds of an asset, at cost and at value, with its lots. */
export function PositionCard({ position: p, showAccount = true }: { position: PositionResponse; showAccount?: boolean }) {
  const [open, setOpen] = useState(false);
  const { data: lots } = useLots(p.accountId, p.assetId, open);
  const gainNegative = p.gain?.value.startsWith("-");
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        {showAccount ? <div className="truncate text-xs text-muted-foreground">{p.accountName}</div> : null}
        <CardTitle className="flex items-start justify-between gap-2 text-base">
          <span className="min-w-0">
            <span className="block truncate">{p.code}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{p.name}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block">{p.value ? <Amount amount={p.value} /> : <span className="text-muted-foreground">—</span>}</span>
            {p.gain ? (
              <span className={cn("block whitespace-nowrap text-xs font-normal", gainNegative ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
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
            <Link href={addHoldingHref(MONEY_ROUTES.newMovement("buy"), p.accountId, p.assetId)}>Buy more</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={addHoldingHref(MONEY_ROUTES.newMovement("sell"), p.accountId, p.assetId)}>Sell</Link>
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
