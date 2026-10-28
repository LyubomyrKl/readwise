"use client";

import { useState } from "react";
import { Check, Inbox, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyApi } from "../api";
import { DraftForm } from "../components/DraftForm";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { KIND_LABELS } from "../lib/describe";
import { formatDate, formatValue } from "../lib/format";
import { useDrafts, useMoneyMutation } from "../queries";
import type { TransactionResponse } from "../types";

/** Proposals from recurring rules and Claude: nothing counts until it is approved here. */
export default function DraftsPage() {
  const { data, isLoading } = useDrafts();
  const [editing, setEditing] = useState<TransactionResponse | null>(null);
  const approve = useMoneyMutation((id: string) => moneyApi.drafts.approve(id), { success: "Posted" });
  const reject = useMoneyMutation((id: string) => moneyApi.drafts.reject(id), { success: "Dropped" });
  const drafts = data?.items ?? [];

  return (
    <MoneyPage>
      <PageHeader
        icon={Inbox}
        title="Drafts"
        description="Proposed movements wait here; approve to post, edit first if something is off, or drop."
      />
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : drafts.length === 0 ? (
        <EmptyState title="Nothing to approve">Recurring movements and Claude&apos;s proposals appear here.</EmptyState>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="truncate">{d.note ?? KIND_LABELS[d.kind]}</span>
                  <span className="flex gap-1">
                    <Badge variant="secondary">{KIND_LABELS[d.kind]}</Badge>
                    {d.proposedBy?.startsWith("token:") ? <Badge variant="outline">From Claude</Badge> : null}
                    {d.proposedBy?.startsWith("recurring:") ? <Badge variant="outline">Recurring</Badge> : null}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DraftSummary draft={d} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" onClick={() => reject.mutate(d.id)} disabled={reject.isPending}>
                    <X className="mr-1 h-4 w-4" /> Drop
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(d)}>
                    <Pencil className="mr-1 h-4 w-4" /> Edit and post
                  </Button>
                  <Button onClick={() => approve.mutate(d.id)} disabled={approve.isPending}>
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit and post</SheetTitle>
            <SheetDescription>Posting uses what you see here.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{editing ? <DraftForm draft={editing} onDone={() => setEditing(null)} /> : null}</div>
        </SheetContent>
      </Sheet>
    </MoneyPage>
  );
}

function DraftSummary({ draft }: { draft: TransactionResponse }) {
  const input = draft.draft?.input ?? {};
  const rows: [string, string][] = [["Date", formatDate(draft.date)]];
  const money = (amount: unknown, currency: unknown) =>
    typeof amount === "string" && typeof currency === "string" ? formatValue(amount, currency) : String(amount ?? "—");
  if ("amount" in input) rows.push(["Amount", money(input.amount, input.currency)]);
  if ("amountOut" in input) rows.push(["Sent", money(input.amountOut, input.fromCurrency)]);
  if ("amountIn" in input) rows.push(["Received", money(input.amountIn, input.toCurrency)]);
  if ("total" in input) rows.push(["Total paid", money(input.total, input.currency)]);
  if ("units" in input) rows.push(["Units", String(input.units)]);
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
