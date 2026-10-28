"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListOrdered, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSelect, CategoryFilterSelect, DateInput, Field, NONE, SimpleSelect } from "../components/Fields";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { TransactionList } from "../components/TransactionList";
import { KIND_LABELS } from "../lib/describe";
import { useTransactions } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { TransactionFilters, TransactionKind } from "../types";

/** Filters start from the link that opened the page (?account=&category=&kind=&from=&to=), e.g. a category in a report. */
export default function TransactionsPage() {
  const params = useSearchParams();
  const [accountId, setAccountId] = useState(params.get("account") ?? "");
  const [categoryId, setCategoryId] = useState(params.get("category") ?? "");
  const [kind, setKind] = useState<string>(params.get("kind") ?? NONE);
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [q, setQ] = useState("");

  const filters = useMemo<TransactionFilters>(
    () => ({
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      kind: kind === NONE ? undefined : kind,
      from: from || undefined,
      to: to || undefined,
      q: q.trim() || undefined,
    }),
    [accountId, categoryId, kind, from, to, q]
  );
  const txs = useTransactions(filters);
  const items = txs.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = !!(accountId || categoryId || kind !== NONE || from || to || q.trim());

  return (
    <MoneyPage>
      <PageHeader
        icon={ListOrdered}
        title="Transactions"
        description="Everything posted, newest first. A mistake is fixed by a correction, never by rewriting."
        actions={
          <Button asChild>
            <Link href={MONEY_ROUTES.newMovement()}>
              <Plus className="mr-1 h-4 w-4" /> New
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Account">
          <div className="flex gap-1">
            <AccountSelect value={accountId} onChange={setAccountId} placeholder="All accounts" />
            {accountId ? (
              <Button variant="ghost" size="sm" onClick={() => setAccountId("")}>
                Clear
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="Kind">
          <SimpleSelect
            value={kind}
            onChange={setKind}
            options={[
              { value: NONE, label: "All kinds" },
              ...(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] })),
            ]}
          />
        </Field>
        <Field label="Category">
          <CategoryFilterSelect value={categoryId} onChange={setCategoryId} />
        </Field>
        <Field label="From">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="To">
          <DateInput value={to} onChange={setTo} />
        </Field>
        <Field label="Note contains">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          </div>
        </Field>
      </div>

      {txs.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <TransactionList items={items} emptyText={filtered ? "Nothing matches these filters." : "No transactions yet."} />
      )}
      {txs.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void txs.fetchNextPage()} disabled={txs.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      ) : null}
    </MoneyPage>
  );
}
