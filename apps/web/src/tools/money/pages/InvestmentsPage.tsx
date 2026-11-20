"use client";

import { useState } from "react";
import Link from "next/link";
import { LineChart, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyApi } from "../api";
import { ACCOUNT_TYPE_SHORT_LABELS } from "../components/AccountForm";
import { AmountInput, DateInput } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { AddHoldingTile, PositionCard } from "../components/PositionCard";
import { addHoldingHref, holdingsByAccount } from "../lib/assets";
import { formatDate, formatValue, normalizeAmountInput, today } from "../lib/format";
import { useAccounts, useAssets, useMoneyMutation, usePositions } from "../queries";
import { MONEY_ROUTES } from "../routes";

export default function InvestmentsPage() {
  const { data: positions, isLoading } = usePositions();
  const { data: accounts, isLoading: loadingAccounts } = useAccounts(true);
  const [pricing, setPricing] = useState(false);
  // account by account, the empty ones too: holding something means adding it to one of them
  const groups = holdingsByAccount(accounts ?? [], positions ?? []);
  const addHolding = (accountId?: string) => addHoldingHref(MONEY_ROUTES.newMovement("buy"), accountId);

  return (
    <MoneyPage>
      <PageHeader
        icon={LineChart}
        title="Investments"
        description="What each investment and bonds account holds, at cost and at value."
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
              <Link href={addHolding()}>
                <Plus className="mr-1 h-4 w-4" /> Add a holding
              </Link>
            </Button>
          </>
        }
      />

      {isLoading || loadingAccounts ? (
        <Skeleton className="h-48" />
      ) : groups.length === 0 ? (
        <EmptyState title="No investment account yet">
          Holdings live in an investment or bonds account: a broker, a bond registry.{" "}
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.accounts}>
            Create one
          </Link>{" "}
          with the type Investment or Bonds, then add a holding to it.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map(({ account, positions: list }) => (
            <section key={account.id} aria-label={account.name} className="space-y-2">
              <h2 className="min-w-0 truncate text-sm font-semibold">
                <Link href={MONEY_ROUTES.account(account.id)} className="hover:underline">
                  {account.name}
                </Link>{" "}
                <span className="font-normal text-muted-foreground">· {ACCOUNT_TYPE_SHORT_LABELS[account.type]}</span>
              </h2>
              <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((p) => (
                  <PositionCard key={p.assetId} position={p} showAccount={false} />
                ))}
                {account.archivedAt ? null : <AddHoldingTile href={addHolding(account.id)} />}
              </div>
            </section>
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
