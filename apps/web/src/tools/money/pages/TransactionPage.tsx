"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Undo2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyApi } from "../api";
import { Amount, Units } from "../components/Amount";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { KIND_LABELS, title } from "../lib/describe";
import { formatDate } from "../lib/format";
import { movementFromTransaction } from "../lib/movement";
import { useMoneyMutation, useTransaction } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { EntryResponse } from "../types";

const ROLE_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expenses",
  opening_balance: "Opening balances",
  conversion: "Conversion",
};

export default function TransactionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: tx, isLoading } = useTransaction(id);
  const reverse = useMoneyMutation(() => moneyApi.transactions.reverse(id), {
    success: "Reversed",
    onSuccess: (reversal) => router.push(MONEY_ROUTES.transaction(reversal.id)),
  });

  if (isLoading || !tx) {
    return (
      <MoneyPage>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
      </MoneyPage>
    );
  }

  const editable = tx.status === "posted" && !tx.reversedBy && tx.kind !== "correction" && !!movementFromTransaction(tx);
  const reversible = tx.status === "posted" && !tx.reversedBy && tx.kind !== "correction";
  const own = tx.entries.filter((e) => e.accountType !== "system");
  const books = tx.entries.filter((e) => e.accountType === "system");

  return (
    <MoneyPage>
      <Link href={MONEY_ROUTES.transactions} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Transactions
      </Link>
      <PageHeader
        title={title(tx)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {formatDate(tx.date)}
            <Badge variant="secondary">{KIND_LABELS[tx.kind]}</Badge>
            {tx.status === "draft" ? <Badge variant="outline">Draft</Badge> : null}
            {tx.reversedBy ? <Badge variant="outline">Reversed</Badge> : null}
            {tx.impliedRate ? <span>Rate {tx.impliedRate}</span> : null}
          </span>
        }
        actions={
          <>
            {editable ? (
              <Button variant="outline" asChild>
                <Link href={`${MONEY_ROUTES.newMovement()}?correct=${tx.id}`}>
                  <Pencil className="mr-1 h-4 w-4" /> Correct
                </Link>
              </Button>
            ) : null}
            {reversible ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">
                    <Undo2 className="mr-1 h-4 w-4" /> Reverse
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reverse this transaction?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A correction with every entry negated is posted on the same date. Balances return to what they were;
                      both transactions stay in the history.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction onClick={() => reverse.mutate(undefined)}>Reverse</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        {tx.correctsId ? (
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.transaction(tx.correctsId)}>
            {tx.kind === "correction" ? "Reverses" : "Corrects"} the original
          </Link>
        ) : null}
        {tx.reversedBy ? (
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.transaction(tx.reversedBy)}>
            Reversed by a correction
          </Link>
        ) : null}
        {tx.replacedBy ? (
          <Link className="underline underline-offset-4" href={MONEY_ROUTES.transaction(tx.replacedBy)}>
            Replaced by the corrected version
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <EntryTable entries={own} />
        </CardContent>
      </Card>

      {books.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bookkeeping side</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Every transaction balances to zero per currency: income, expenses, opening balances and conversions are
              the other side of your accounts.
            </p>
            <EntryTable entries={books} />
          </CardContent>
        </Card>
      ) : null}

      <div className="text-xs text-muted-foreground">
        {tx.postedAt ? `Posted ${new Date(tx.postedAt).toLocaleString()}` : `Created ${new Date(tx.createdAt).toLocaleString()}`}
        {tx.proposedBy && tx.proposedBy !== "user" ? ` · ${proposedByText(tx.proposedBy)}` : ""}
      </div>
    </MoneyPage>
  );
}

function EntryTable({ entries }: { entries: EntryResponse[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No entries (a draft).</p>;
  return (
    <div className="divide-y">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate">
              {e.accountType === "system" ? (ROLE_LABELS[e.systemRole ?? ""] ?? e.accountName) : (
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

/** "token:…" -> "proposed by Claude", "recurring:…" -> "from a recurring movement", "import:…" -> "imported". */
function proposedByText(actor: string): string {
  if (actor.startsWith("token:")) return "proposed by Claude";
  if (actor.startsWith("recurring:")) return "from a recurring movement";
  if (actor.startsWith("import:")) return "imported";
  if (actor === "scheduler") return "by the daily jobs";
  return `by ${actor}`;
}
