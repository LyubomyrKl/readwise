"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, Landmark, Plus, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPE_SHORT_LABELS, NewAccountForm } from "../components/AccountForm";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { moneyApi } from "../api";
import { applyOrder, groupAccounts, UNGROUPED } from "../lib/accounts";
import { formatNumber, formatUnits, isNegative, isZero } from "../lib/format";
import { useAccounts, useMoneyMutation } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AccountResponse } from "../types";

export default function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  // one list with the archived ones: the toggle needs their count either way
  const { data: all, isLoading } = useAccounts(true);
  const router = useRouter();

  // the order being saved, shown at once; the list from the API takes over when it is saved
  const [order, setOrder] = useState<string[] | null>(null);
  const reorder = useMoneyMutation((ids: string[]) => moneyApi.accounts.reorder(ids), { onSuccess: () => setOrder(null) });

  const archived = (all ?? []).filter((a) => a.archivedAt);
  const accounts = applyOrder((all ?? []).filter((a) => !a.archivedAt), order);
  const groups = groupAccounts(accounts);
  // headings only when a group gathers several accounts; otherwise each card names its group
  const headed = groups.some(([, list]) => list.length > 1);
  const move = (ids: string[]) => {
    setOrder(ids);
    reorder.mutate(ids, { onError: () => setOrder(null) });
  };

  return (
    <MoneyPage>
      <PageHeader
        icon={Landmark}
        title="Accounts"
        description="Every account with one balance per currency. Drag a card by its handle to put it in its place."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={MONEY_ROUTES.assets}>
                <Tag className="mr-1 h-4 w-4" /> Assets and classes
              </Link>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> New account
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : accounts.length === 0 && archived.length === 0 ? (
        <EmptyState title="No accounts yet">
          Create your first account, or import your history.
        </EmptyState>
      ) : headed ? (
        <div className="space-y-6">
          {groups.map(([group, list]) => (
            <section key={group} aria-label={group} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</h2>
              <SortableGrid
                accounts={list}
                // within its group; the groups keep their places
                onMove={(ids) => move(groups.flatMap(([g, l]) => (g === group ? ids : l.map((a) => a.id))))}
              />
            </section>
          ))}
        </div>
      ) : (
        <SortableGrid accounts={accounts} showGroup onMove={move} />
      )}

      {archived.length > 0 ? (
        <div className="space-y-2">
          <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
          </Button>
          {showArchived ? (
            <section aria-label="Archived" className="space-y-2 pt-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Archived</h2>
              <AccountGrid accounts={archived} showGroup />
            </section>
          ) : null}
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

/**
 * Cards that can be dragged into another order by their handle: with a mouse, by touch (hold
 * briefly, so the page still scrolls), or with the keyboard (focus the handle, space, arrows).
 */
function SortableGrid({
  accounts,
  showGroup = false,
  onMove,
}: {
  accounts: AccountResponse[];
  showGroup?: boolean;
  onMove: (ids: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = accounts.map((a) => a.id);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onMove(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <SortableCard key={a.id} account={a} showGroup={showGroup} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({ account, showGroup }: { account: AccountResponse; showGroup: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: account.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative min-w-0", isDragging && "z-10 opacity-80 shadow-lg")}
    >
      <AccountCard account={account} showGroup={showGroup} handleSpace />
      {/* beside the link, not in it: a button inside a link is not valid */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${account.name}`}
        className="absolute right-9 top-3 cursor-grab touch-none rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </li>
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

/** One account as a card; the whole card is the link to it. `handleSpace` leaves room for a drag handle. */
function AccountCard({ account, showGroup, handleSpace = false }: { account: AccountResponse; showGroup: boolean; handleSpace?: boolean }) {
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
        <div className={cn("min-w-0", handleSpace && "pr-7")}>
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
