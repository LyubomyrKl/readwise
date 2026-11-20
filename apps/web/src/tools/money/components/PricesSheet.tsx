"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { moneyApi } from "../api";
import { formatDate, formatValue, normalizeAmountInput, today } from "../lib/format";
import { useAssets, useMoneyMutation } from "../queries";
import { AmountInput, DateInput } from "./Fields";

/**
 * Prices entered by hand, the quarterly checkpoint: one price per asset for a day. On the assets
 * page for every asset with a price; on an account's page for what it holds (`assetIds`).
 */
export function PricesSheet({
  open,
  onOpenChange,
  assetIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds?: string[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Update prices</SheetTitle>
          <SheetDescription>The quarterly checkpoint: one price per asset for a day.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <PricesForm assetIds={assetIds} onDone={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PricesForm({ assetIds, onDone }: { assetIds?: string[]; onDone: () => void }) {
  const { data: assets } = useAssets();
  const priced = (assets ?? []).filter((a) => a.valuation !== "bond_formula" && (!assetIds || assetIds.includes(a.id)));
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
            <label htmlFor={`price-${a.id}`} className="block truncate font-medium">
              {a.code}
            </label>
            <div className="text-xs text-muted-foreground">
              {a.latestPrice ? `${formatValue(a.latestPrice.price, a.latestPrice.currency)} on ${formatDate(a.latestPrice.date)}` : "no price yet"}
            </div>
          </div>
          <AmountInput
            id={`price-${a.id}`}
            value={values[a.id] ?? ""}
            onChange={(v) => setValues((all) => ({ ...all, [a.id]: v }))}
            placeholder={a.quoteCurrency}
          />
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
