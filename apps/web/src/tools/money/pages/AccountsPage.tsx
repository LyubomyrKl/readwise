"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Landmark, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_SHORT_LABELS, NewAccountForm } from "../components/AccountForm";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { groupAccounts, UNGROUPED } from "../lib/accounts";
import { formatNumber, formatUnits, isNegative, isZero } from "../lib/format";
import { useAccounts } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AccountResponse } from "../types";

export default function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  // one list with the archived ones: the toggle needs their count either way
  const { data: all, isLoading } = useAccounts(true);
  const router = useRouter();

  const archivedCount = (all ?? []).filter((a) => a.archivedAt).length;
  const accounts = (all ?? []).filter((a) => showArchived || !a.archivedAt);
  const groups = groupAccounts(accounts);
  // headings only when a group gathers several accounts; otherwise each card names its group
  const headed = groups.some(([, list]) => list.length > 1);

  return (
    <MoneyPage>
      <PageHeader
        icon={Landmark}
        title="Accounts"
        description="Every account with one balance per currency."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> New account
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState title="No accounts yet">
          Create your first account, or import your history.
        </EmptyState>
      ) : headed ? (
        <div className="space-y-6">
          {groups.map(([group, list]) => (
            <section key={group} aria-label={group} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h2>
              <AccountGrid accounts={list} />
            </section>
          ))}
        </div>
      ) : (
        <AccountGrid accounts={groups.flatMap(([, list]) => list)} showGroup />
      )}

      {archivedCount > 0 ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
          </Button>
        </div>
      ) : null}

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New account</SheetTitle>
            <SheetDescription>An account with a balance per currency, in a group if you like.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <NewAccountForm
              onDone={(account) => {
                setCreating(false);
                router.push(MONEY_ROUTES.account(account.id));
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </MoneyPage>
  );
}

function AccountGrid({ accounts, showGroup = false }: { accounts: AccountResponse[]; showGroup?: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => (
        <li key={a.id} className="min-w-0">
          <AccountCard account={a} showGroup={showGroup} />
        </li>
      ))}
    </ul>
  );
}

/** One account as a card; the whole card is the link to it. */
function AccountCard({ account, showGroup }: { account: AccountResponse; showGroup: boolean }) {
  const type = ACCOUNT_TYPE_SHORT_LABELS[account.type];
  const group = showGroup ? account.institution?.name ?? UNGROUPED : null;
  const cash = account.balances.filter((b) => b.kind === "currency");
  const units = account.balances.filter((b) => b.kind === "asset");
  return (
    <Link
      href={MONEY_ROUTES.account(account.id)}
      className={cn(
        "group flex h-full flex-col gap-3 rounded-lg border bg-card p-4 text-sm transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        account.archivedAt && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {group ? <span className="truncate">{group}</span> : null}
            {group ? <span aria-hidden>·</span> : null}
            <span>{type}</span>
            {account.archivedAt ? (
              <Badge variant="outline" className="text-[10px]">
                Archived
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-base font-semibold">{account.name}</div>
        </div>
        <ChevronRight
          aria-hidden
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground"
        />
      </div>
      {account.balances.length === 0 ? (
        <p className="text-muted-foreground">No currencies yet</p>
      ) : (
        <dl className="space-y-1">
          {cash.map((b) => {
            const empty = !b.balance || isZero(b.balance.value);
            return (
              <div key={b.subAccountId} className={cn("flex items-baseline justify-between gap-3", empty && "text-muted-foreground")}>
                <dt className="text-xs font-medium text-muted-foreground">{b.code}</dt>
                <dd
                  className={cn(
                    "tabular-nums whitespace-nowrap",
                    !empty && "font-medium",
                    b.balance && isNegative(b.balance.value) && "text-destructive"
                  )}
                >
                  {b.balance ? formatNumber(b.balance.value) : "—"}
                </dd>
              </div>
            );
          })}
          {units.map((b) => (
            <div key={b.subAccountId} className="flex items-baseline justify-between gap-3 text-muted-foreground">
              <dt className="text-xs font-medium">{b.code}</dt>
              <dd className="tabular-nums whitespace-nowrap">{b.units ? `${formatUnits(b.units)} units` : "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}
