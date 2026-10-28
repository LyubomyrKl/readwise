"use client";

import Link from "next/link";
import { ArrowRight, Inbox, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Amount, Units } from "../components/Amount";
import { accountLabel } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { TransactionList } from "../components/TransactionList";
import { useAccounts, useDrafts, useTransactions } from "../queries";
import { MONEY_ROUTES } from "../routes";

/** Overview: what each account holds and what moved last. */
export default function MoneyHomePage() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: drafts } = useDrafts();
  const recent = useTransactions({ limit: 10 });
  const items = recent.data?.pages[0]?.items ?? [];
  const pending = drafts?.items.length ?? 0;

  return (
    <MoneyPage>
      <PageHeader
        icon={Wallet}
        title="Money"
        description="Every account, every movement, every investment."
        actions={
          <Button asChild>
            <Link href={MONEY_ROUTES.newMovement()}>
              <Plus className="mr-1 h-4 w-4" /> New movement
            </Link>
          </Button>
        }
      />

      {pending > 0 ? (
        <Link href={MONEY_ROUTES.drafts} className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm hover:bg-muted">
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4" /> {pending} {pending === 1 ? "draft waits" : "drafts wait"} for approval
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Accounts</CardTitle>
          <Link href={MONEY_ROUTES.accounts} className="text-sm text-muted-foreground hover:text-foreground">
            All accounts
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : (accounts ?? []).length === 0 ? (
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
            <div className="divide-y">
              {(accounts ?? []).map((a) => (
                <Link key={a.id} href={MONEY_ROUTES.account(a.id)} className="flex items-start justify-between gap-3 py-2 text-sm hover:bg-muted/30">
                  <span className="truncate">{accountLabel(a)}</span>
                  <span className="flex flex-col items-end">
                    {a.balances.map((b) =>
                      b.kind === "currency" ? (
                        <Amount key={b.subAccountId} amount={b.balance} />
                      ) : (
                        <Units key={b.subAccountId} units={b.units} code={b.code} />
                      )
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent</h2>
          <Link href={MONEY_ROUTES.transactions} className="text-sm text-muted-foreground hover:text-foreground">
            All transactions
          </Link>
        </div>
        {recent.isLoading ? <Skeleton className="h-40" /> : <TransactionList items={items} />}
      </section>
    </MoneyPage>
  );
}
