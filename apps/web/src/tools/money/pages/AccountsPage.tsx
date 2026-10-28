"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCOUNT_TYPE_LABELS, NewAccountForm } from "../components/AccountForm";
import { Amount, Units } from "../components/Amount";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { useAccounts } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AccountResponse } from "../types";

export default function AccountsPage() {
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data: accounts, isLoading } = useAccounts(archived);
  const router = useRouter();

  const groups = new Map<string, AccountResponse[]>();
  for (const a of accounts ?? []) {
    const key = a.institution?.name ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return (
    <MoneyPage>
      <PageHeader
        icon={Landmark}
        title="Accounts"
        description="Every account with one balance per currency."
        actions={
          <>
            <Button variant="outline" onClick={() => setArchived((v) => !v)}>
              {archived ? "Hide archived" : "Show archived"}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> New account
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (accounts ?? []).length === 0 ? (
        <EmptyState title="No accounts yet">
          Create your first institution and account, or import your history.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([institution, list]) => (
            <section key={institution} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{institution}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((a) => (
                  <AccountCard key={a.id} account={a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New account</SheetTitle>
            <SheetDescription>An account at an institution, with a sub-account per currency.</SheetDescription>
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

function AccountCard({ account }: { account: AccountResponse }) {
  return (
    <Link href={MONEY_ROUTES.account(account.id)} className="group">
      <Card className="h-full transition-colors group-hover:bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="truncate">{account.name}</span>
            <span className="flex shrink-0 gap-1">
              {account.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
              <Badge variant={account.type === "debt" ? "destructive" : "secondary"}>{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {account.balances.length === 0 ? <span className="text-muted-foreground">No sub-accounts</span> : null}
          {account.balances.map((b) => (
            <div key={b.subAccountId} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{b.code}</span>
              {b.kind === "currency" ? <Amount amount={b.balance} /> : <Units units={b.units} />}
            </div>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
