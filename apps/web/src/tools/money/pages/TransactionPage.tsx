"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BackLink, useBack } from "@platform/ui/BackLink";
import { moneyApi } from "../api";
import { Amount, Units } from "../components/Amount";
import { MovementForm, type CashKind } from "../components/MovementForm";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { TradeForm, TRADE_KINDS, type TradeKind } from "../components/TradeForm";
import { categoryLines, KIND_LABELS, ownLegs, title } from "../lib/describe";
import { formatDate, formatValue } from "../lib/format";
import { movementFromTransaction } from "../lib/movement";
import { useMoneyMutation, useTransaction } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { EntryResponse, Movement, TransactionResponse } from "../types";

const ROLE_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expenses",
  opening_balance: "Opening balances",
  conversion: "Conversion",
};

/**
 * One movement, open to change: its own form, filled in. Saving a change posts a correction (the
 * original reversed, the changed one in its place) and deleting posts a reversal, so the books keep
 * both (rule 4). What the history keeps but no longer counts (a deleted or changed movement, a
 * reversal) opens read-only, with the way to what took its place.
 */
export default function TransactionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tx, isLoading } = useTransaction(id);
  const back = useBack(MONEY_ROUTES.transactions);
  const correct = useMoneyMutation((movement: Movement) => moneyApi.movements.correct(id, movement), { success: "Changed" });
  const remove = useMoneyMutation(() => moneyApi.transactions.reverse(id), { success: "Deleted", onSuccess: back });

  if (isLoading || !tx) {
    return (
      <MoneyPage>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </MoneyPage>
    );
  }

  // what still counts: the books' last word on it
  const stands = tx.status === "posted" && !tx.reversedBy && tx.kind !== "correction";
  const initial = stands ? movementFromTransaction(tx) : undefined;
  const form = { lockKind: true, submitLabel: "Save changes", onSubmit: correct.mutateAsync, onDone: back, onUnchanged: back };

  return (
    <MoneyPage>
      <BackLink fallback={MONEY_ROUTES.transactions} />
      <PageHeader
        title={title(tx)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDate(tx.date)}
            <Badge variant="secondary">{KIND_LABELS[tx.kind]}</Badge>
            {tx.replacedBy ? <Badge variant="outline">Changed</Badge> : tx.reversedBy ? <Badge variant="outline">Deleted</Badge> : null}
            {tx.status === "draft" ? <Badge variant="outline">Draft</Badge> : null}
            {tx.impliedRate ? <span>Rate {tx.impliedRate}</span> : null}
          </span>
        }
        actions={stands ? <DeleteButton onDelete={() => remove.mutate(undefined)} pending={remove.isPending} /> : null}
      />

      {initial ? (
        <Card>
          <CardContent>
            {TRADE_KINDS.some((k) => k.value === initial.kind) ? (
              <TradeForm initial={initial} initialKind={initial.kind as TradeKind} {...form} />
            ) : (
              <MovementForm initial={initial} initialKind={initial.kind as CashKind} {...form} />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <Moved tx={tx} />
            <p className="text-sm text-muted-foreground">
              <Status tx={tx} />
            </p>
          </CardContent>
        </Card>
      )}

      <About tx={tx} />
    </MoneyPage>
  );
}

function DeleteButton({ onDelete, pending }: { onDelete: () => void; pending: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this movement?</AlertDialogTitle>
          <AlertDialogDescription>
            It is reversed, not erased: a reversal with every amount negated is posted on the same day, so the balances
            are as if it never happened. The history keeps both (Transactions, Show corrections and reversals).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** What moved, read-only: each of your accounts with its amount, the categories, the note. */
function Moved({ tx }: { tx: TransactionResponse }) {
  const categories = categoryLines(tx);
  return (
    <div className="space-y-3 text-sm">
      <dl className="divide-y">
        {ownLegs(tx).map((l) => (
          <div key={`${l.accountId}-${l.code}`} className="flex items-center justify-between gap-3 py-2">
            <dt className="min-w-0 truncate">
              <Link className="hover:underline" href={MONEY_ROUTES.account(l.accountId)}>
                {l.accountName}
              </Link>
            </dt>
            <dd>{l.amount ? <Amount amount={l.amount} signed /> : <Units units={l.units} code={l.code} />}</dd>
          </div>
        ))}
      </dl>
      {categories.length > 0 ? (
        <p className="text-muted-foreground">
          {categories.map((c) => `${c.name} ${formatValue(c.amount.value.replace(/^-/, ""), c.amount.currency)}`).join(", ")}
        </p>
      ) : null}
      {tx.note ? <p className="whitespace-pre-wrap">{tx.note}</p> : null}
    </div>
  );
}

/** Why a movement opens read-only, and where its story goes on. */
function Status({ tx }: { tx: TransactionResponse }) {
  const to = (id: string, text: string) => (
    <Link className="text-foreground underline underline-offset-4" href={MONEY_ROUTES.transaction(id)}>
      {text}
    </Link>
  );
  if (tx.kind === "correction") return <>This reversal undoes {tx.correctsId ? to(tx.correctsId, "a movement") : "a movement"}: together they count as nothing.</>;
  if (tx.replacedBy) return <>Changed later: this version no longer counts. {to(tx.replacedBy, "The version that does")}.</>;
  if (tx.reversedBy) return <>Deleted: it no longer counts. {to(tx.reversedBy, "The reversal")} keeps the record.</>;
  if (tx.status === "draft") return <>A proposal waiting for your approval in Settings, Money, Claude.</>;
  return <>This kind of movement has no form to change it in: delete it and record it again.</>;
}

/** The small print: when and how it was recorded, an earlier version, and the double entry on request. */
function About({ tx }: { tx: TransactionResponse }) {
  const [entries, setEntries] = useState(false);
  const recorded = tx.postedAt ?? tx.createdAt;
  const lines: ReactNode[] = [
    `Recorded ${new Date(recorded).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}${tx.proposedBy && tx.proposedBy !== "user" ? `, ${proposedByText(tx.proposedBy)}` : ""}`,
  ];
  if (tx.correctsId && tx.kind !== "correction") {
    lines.push(
      <Link key="earlier" className="underline underline-offset-4 hover:text-foreground" href={MONEY_ROUTES.transaction(tx.correctsId)}>
        The version it replaced
      </Link>
    );
  }
  return (
    <section aria-label="About this movement" className="space-y-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {lines.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
        <button type="button" className="inline-flex items-center gap-0.5 hover:text-foreground" onClick={() => setEntries((v) => !v)}>
          {entries ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} The double entry
        </button>
      </div>
      {entries ? (
        <Card>
          <CardContent>
            <p className="mb-2">
              Every movement sums to zero per currency: income, expenses, opening balances and conversions are the other side of
              your accounts.
            </p>
            <EntryTable entries={tx.entries} />
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function EntryTable({ entries }: { entries: EntryResponse[] }) {
  return (
    <div className="divide-y text-sm text-foreground">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="truncate">
              {e.accountType === "system" ? (
                (ROLE_LABELS[e.systemRole ?? ""] ?? e.accountName)
              ) : (
                <Link className="hover:underline" href={MONEY_ROUTES.account(e.accountId)}>
                  {e.accountName}
                </Link>
              )}
            </div>
            {e.categoryName ? <div className="text-xs text-muted-foreground">{e.categoryName}</div> : null}
          </div>
          {e.amount ? <Amount amount={e.amount} signed /> : <Units units={e.units} code={e.code} />}
        </div>
      ))}
    </div>
  );
}

/** "token:…" -> "from Claude", "recurring:…" -> "from a recurring movement", "import:…" -> "imported". */
function proposedByText(actor: string): string {
  if (actor.startsWith("token:")) return "from Claude";
  if (actor.startsWith("recurring:")) return "from a recurring movement";
  if (actor.startsWith("import:")) return "imported";
  if (actor === "scheduler") return "by the daily jobs";
  return `by ${actor}`;
}
