"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckSquare, ListOrdered, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { moneyApi } from "../api";
import { AccountSelect, CategoryFilterSelect, CategorySelect, DateInput, Field, NONE, SimpleSelect } from "../components/Fields";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { useQuickEntry } from "../components/QuickEntry";
import { TransactionList, type RowSelection } from "../components/TransactionList";
import { inCategory, pickable, sharedCategoryKind } from "../lib/bulk";
import { KIND_LABELS } from "../lib/describe";
import { errorMessage, moneyKeys, useCategories, useTransactions } from "../queries";
import type { TransactionFilters, TransactionKind, TransactionResponse } from "../types";

/** Filters start from the link that opened the page (?account=&category=&kind=&from=&to=), e.g. a category in a report. */
export default function TransactionsPage() {
  const params = useSearchParams();
  const quick = useQuickEntry();
  const [accountId, setAccountId] = useState(params.get("account") ?? "");
  const [categoryId, setCategoryId] = useState(params.get("category") ?? "");
  const [kind, setKind] = useState<string>(params.get("kind") ?? NONE);
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [q, setQ] = useState("");
  // what stands by default: a corrected movement once, a reversed one not at all
  const [trail, setTrail] = useState(params.get("trail") === "1");

  const filters = useMemo<TransactionFilters>(
    () => ({
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      kind: kind === NONE ? undefined : kind,
      from: from || undefined,
      to: to || undefined,
      q: q.trim() || undefined,
      all: trail || undefined,
    }),
    [accountId, categoryId, kind, from, to, q, trail]
  );
  const txs = useTransactions(filters);
  const items = txs.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = !!(accountId || categoryId || kind !== NONE || from || to || q.trim());
  // on a phone the filters fold away so the list starts on the first screen
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = [accountId, categoryId, kind !== NONE, from, to, trail].filter(Boolean).length;

  // several at once: pick rows, then a category for all of them, or delete them
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Map<string, TransactionResponse>>(new Map());
  const [working, setWorking] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: categories } = useCategories();
  const chosen = [...picked.values()];
  const categoryKind = sharedCategoryKind(chosen);
  useEffect(() => {
    quick.setButtonHidden(selecting);
    return () => quick.setButtonHidden(false);
  }, [quick, selecting]);
  const selection: RowSelection | undefined = selecting
    ? {
        picked: new Set(picked.keys()),
        can: pickable,
        toggle: (tx) =>
          setPicked((prev) => {
            const next = new Map(prev);
            if (next.has(tx.id)) next.delete(tx.id);
            else next.set(tx.id, tx);
            return next;
          }),
      }
    : undefined;
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Map());
  };

  /** one correction or reversal after another, each under the ledger's lock */
  async function forEachPicked(doing: string, run: (tx: TransactionResponse) => Promise<boolean>, done: (count: number) => string) {
    let count = 0;
    try {
      for (const [i, tx] of chosen.entries()) {
        setWorking(`${doing} ${i + 1} of ${chosen.length}…`);
        if (await run(tx)) count++;
      }
      toast.success(done(count));
    } catch (e) {
      toast.error(`${errorMessage(e)} (${count} done before it)`);
    } finally {
      setWorking(null);
      setPicked(new Map());
      await queryClient.invalidateQueries({ queryKey: moneyKeys.all });
    }
  }
  const setCategory = (id: string) => {
    const name = categories?.find((c) => c.id === id)?.name ?? "the category";
    void forEachPicked(
      "Changing",
      async (tx) => {
        const movement = inCategory(tx, id);
        if (movement) await moneyApi.movements.correct(tx.id, movement);
        return !!movement;
      },
      (count) => (count === 1 ? `1 movement moved to ${name}` : `${count} movements moved to ${name}`)
    );
  };
  const remove = () =>
    void forEachPicked(
      "Deleting",
      async (tx) => !!(await moneyApi.transactions.reverse(tx.id)),
      (count) => (count === 1 ? "1 movement deleted" : `${count} movements deleted`)
    );

  return (
    <MoneyPage>
      <PageHeader
        icon={ListOrdered}
        title="Transactions"
        description="What stands, newest first: a corrected movement shows once, a reversed one not at all. Mistakes are fixed by corrections, never by rewriting."
        actions={
          <>
            {selecting ? null : (
              <Button variant="outline" onClick={() => setSelecting(true)}>
                <CheckSquare className="mr-1 h-4 w-4" /> Select
              </Button>
            )}
            <Button onClick={() => quick.open({ accountId: accountId || undefined })}>
              <Plus className="mr-1 h-4 w-4" /> New
            </Button>
          </>
        }
      />

      <div className="flex gap-2 md:hidden">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
        </div>
        <Button variant="outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
          <SlidersHorizontal className="mr-1 h-4 w-4" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
        </Button>
      </div>

      <div className={cn("gap-3 rounded-lg border p-3 sm:grid-cols-2 md:grid lg:grid-cols-3", filtersOpen ? "grid" : "hidden")}>
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
        <Field label="Note contains" className="hidden md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          </div>
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={trail}
            onChange={(e) => setTrail(e.target.checked)}
          />
          Show corrections and reversals (the whole trail)
        </label>
      </div>

      {txs.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <TransactionList items={items} selection={selection} emptyText={filtered ? "Nothing matches these filters." : "No transactions yet."} />
      )}
      {txs.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void txs.fetchNextPage()} disabled={txs.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      ) : null}

      {selecting ? (
        <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
          <div role="toolbar" aria-label="Picked movements" className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
            <span className="px-2 text-sm tabular-nums" aria-live="polite">
              {working ?? `${chosen.length} picked`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!working}
              onClick={() => setPicked(new Map(items.filter(pickable).map((tx) => [tx.id, tx])))}
            >
              All shown
            </Button>
            <div className="w-52">
              <CategorySelect
                kind={categoryKind ?? "expense"}
                value=""
                onChange={setCategory}
                allowNone={false}
                label="Set category"
                placeholder={chosen.length > 0 && !categoryKind ? "Expenses or income, not both" : "Set category"}
                disabled={!categoryKind || !!working}
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={chosen.length === 0 || !!working}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{chosen.length === 1 ? "Delete 1 movement?" : `Delete ${chosen.length} movements?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    Each is reversed, not erased: a reversal posted on its day, so the balances are as if it never happened. The
                    history keeps both (Show corrections and reversals).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep them</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="sm" disabled={!!working} onClick={stopSelecting}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </MoneyPage>
  );
}
