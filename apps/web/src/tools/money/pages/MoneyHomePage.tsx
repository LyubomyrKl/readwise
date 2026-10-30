"use client";

import Link from "next/link";
import { ArrowRight, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Amount } from "../components/Amount";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { TransactionList } from "../components/TransactionList";
import { useQueryParam } from "../components/useQueryParam";
import { AllocationRows } from "../components/views/AllocationView";
import { BasePicker } from "../components/views/BasePicker";
import { CategoryBreakdown, FLOW_SERIES, MonthFigures } from "../components/views/MonthlyView";
import { MissingRates, NetWorthHeadline } from "../components/views/NetWorthView";
import { formatMonth } from "../lib/format";
import { suggestBases } from "../lib/views";
import { useHome, useMoneySettings, useTransactions } from "../queries";
import { MONEY_ROUTES } from "../routes";

function More({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/** The three answers: what you own, where the money went this month, how it is allocated. */
export default function MoneyHomePage() {
  const [base, setBase] = useQueryParam<string>("base", "");
  const { data: settings } = useMoneySettings();
  const home = useHome(base || undefined);
  const recent = useTransactions({ limit: 8 });
  const items = recent.data?.pages[0]?.items ?? [];
  const data = home.data;
  const query = base ? `&base=${base}` : "";
  const empty = data && data.netWorth.accounts.length === 0;

  return (
    <MoneyPage>
      <PageHeader
        icon={Wallet}
        title="Money"
        description="What you own, where the money went, how it is allocated."
        actions={
          <Button asChild>
            <Link href={MONEY_ROUTES.newMovement()}>
              <Plus className="mr-1 h-4 w-4" /> New movement
            </Link>
          </Button>
        }
      />


      {home.isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : empty ? (
        <EmptyState title="No accounts yet">
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.accounts}>
            Create an account
          </Link>{" "}
          or{" "}
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.imports}>
            import your history
          </Link>
          .
        </EmptyState>
      ) : (
        <div className={cn("space-y-4 transition-opacity", home.isPlaceholderData && "opacity-60")}>
          <BasePicker
            value={data.base}
            onChange={(c) => setBase(c === settings?.baseCurrency ? "" : c)}
            suggestions={suggestBases(settings?.baseCurrency, data.netWorth.currencies.map((c) => c.name))}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">What you own</CardTitle>
                <More href={`${MONEY_ROUTES.reports}?view=net-worth${query}`}>Details</More>
              </CardHeader>
              <CardContent className="space-y-4">
                <NetWorthHeadline nw={data.netWorth} />
                <MissingRates currencies={data.netWorth.missingRates} base={data.base} />
                <ul className="divide-y text-sm">
                  {data.netWorth.types.map((t) => (
                    <li key={t.key ?? t.name} className="flex justify-between gap-3 py-1.5">
                      <span className="text-muted-foreground">{t.name}</span>
                      <Amount amount={t.value} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">How it is allocated</CardTitle>
                <More href={`${MONEY_ROUTES.reports}?view=allocation${query}`}>Details</More>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">The bar is the share held, the tick the target.</p>
                <AllocationRows allocation={data.allocation} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Where the money went in {formatMonth(data.month.month)}</CardTitle>
              <More href={`${MONEY_ROUTES.reports}?view=monthly${query}`}>Every month</More>
            </CardHeader>
            <CardContent className="space-y-6">
              <MonthFigures month={data.month} />
              <MissingRates currencies={data.month.missingRates} base={data.base} />
              <div className="grid gap-6 md:grid-cols-2">
                <CategoryBreakdown title="Top expenses" items={data.month.expensesByCategory} span={{ from: data.month.month, to: data.month.month }} color={FLOW_SERIES[1].color} top={5} />
                <CategoryBreakdown title="Income" items={data.month.incomeByCategory} span={{ from: data.month.month, to: data.month.month }} color={FLOW_SERIES[0].color} top={5} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent</h2>
          <More href={MONEY_ROUTES.transactions}>All transactions</More>
        </div>
        {recent.isLoading ? <Skeleton className="h-40" /> : <TransactionList items={items} />}
      </section>
    </MoneyPage>
  );
}
