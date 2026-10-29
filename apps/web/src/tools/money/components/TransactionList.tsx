"use client";

import Link from "next/link";
import { ArrowRight, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { KIND_LABELS, ownLegs, title } from "../lib/describe";
import { formatDate } from "../lib/format";
import { MONEY_ROUTES } from "../routes";
import type { TransactionResponse } from "../types";
import { Amount, Units } from "./Amount";

/** Transactions grouped by day; each row links to its detail page. */
export function TransactionList({
  items,
  highlightAccountId,
  emptyText = "No transactions yet.",
}: {
  items: TransactionResponse[];
  /** on an account page: show only that account's legs */
  highlightAccountId?: string;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;

  const days = new Map<string, TransactionResponse[]>();
  for (const tx of items) days.set(tx.date, [...(days.get(tx.date) ?? []), tx]);

  return (
    <div className="space-y-4">
      {[...days.entries()].map(([date, txs]) => (
        <div key={date}>
          <div className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {formatDate(date)}
          </div>
          <ul className="divide-y rounded-lg border bg-card">
            {txs.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} highlightAccountId={highlightAccountId} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TransactionRow({ tx, highlightAccountId }: { tx: TransactionResponse; highlightAccountId?: string }) {
  const legs = ownLegs(tx).filter((l) => !highlightAccountId || l.accountId === highlightAccountId);
  const reversed = !!tx.reversedBy;
  return (
    <li>
      <Link
        href={MONEY_ROUTES.transaction(tx.id)}
        className={cn(
          "flex items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50",
          reversed && "opacity-60"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-medium", reversed && "line-through")}>{title(tx)}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{KIND_LABELS[tx.kind]}</span>
            {tx.category && tx.note ? <span>· {tx.category.name}</span> : null}
            {!highlightAccountId && legs.length > 0 ? (
              <span className="flex items-center gap-1 truncate">
                ·{" "}
                {legs.map((l, i) => (
                  <span key={`${l.accountId}-${l.code}`} className="flex items-center gap-1">
                    {i > 0 ? <ArrowRight className="h-3 w-3" /> : null}
                    {l.accountName}
                  </span>
                ))}
              </span>
            ) : null}
            {reversed ? (
              <Badge variant="secondary" className="gap-1">
                <Undo2 className="h-3 w-3" /> Reversed
              </Badge>
            ) : null}
            {tx.correctsId && tx.kind !== "correction" ? <Badge variant="secondary">Corrected</Badge> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
          {legs.map((l) =>
            l.amount ? (
              <Amount key={`${l.accountId}-${l.code}`} amount={l.amount} signed />
            ) : (
              <Units key={`${l.accountId}-${l.code}`} units={l.units} code={l.code} />
            )
          )}
        </div>
      </Link>
    </li>
  );
}
