"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PenLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyApi } from "../api";
import { useState } from "react";
import { Segmented } from "../components/Fields";
import { CASH_TABS, MovementForm, type CashKind } from "../components/MovementForm";
import { TradeForm, TRADE_KINDS, type TradeKind } from "../components/TradeForm";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { movementFromTransaction } from "../lib/movement";
import { useMoneyMutation, useTransaction } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { Movement } from "../types";
import { BackLink } from "@platform/ui/BackLink";

/**
 * Records a movement, or corrects a posted one (?correct=<id>): the original
 * is reversed and the corrected movement posted in one step.
 */
export default function NewMovementPage() {
  const params = useSearchParams();
  const router = useRouter();
  const kind = params.get("kind") ?? "expense";
  const accountId = params.get("account") ?? undefined;
  const assetId = params.get("asset") ?? undefined;
  const correctId = params.get("correct") ?? undefined;
  const { data: original, isLoading } = useTransaction(correctId);
  const post = useMoneyMutation((movement: Movement) =>
    correctId ? moneyApi.movements.correct(correctId, movement) : moneyApi.movements.post(movement)
  );

  const initial = original ? movementFromTransaction(original) : undefined;
  // the form gives way to what it saved: back from there returns to where the form was opened
  const done = (id: string) => router.replace(MONEY_ROUTES.transaction(id));
  const startsAsTrade = TRADE_KINDS.some((k) => k.value === (initial?.kind ?? kind));
  const [area, setArea] = useState<"money" | "investments">(startsAsTrade ? "investments" : "money");
  const trade = initial ? startsAsTrade : area === "investments";

  return (
    <MoneyPage>
      <BackLink fallback={MONEY_ROUTES.transactions} />
      <PageHeader
        icon={PenLine}
        title={correctId ? "Correct a transaction" : "New movement"}
        description={
          correctId
            ? "The original is reversed and this one posted in its place; both stay in the history."
            : "Money in, money out, or between your accounts."
        }
      />
      <Card>
        <CardContent className="pt-6">
          {correctId && isLoading ? (
            <Skeleton className="h-64" />
          ) : correctId && !initial ? (
            <p className="text-sm text-muted-foreground">This transaction cannot be edited in a form; reverse it instead.</p>
          ) : (
            <div className="space-y-5">
              {correctId ? null : (
                <Segmented
                  value={area}
                  onChange={setArea}
                  options={[
                    { value: "money", label: "Money" },
                    { value: "investments", label: "Investments" },
                  ]}
                />
              )}
              {trade ? (
                <TradeForm
                  initial={initial}
                  initialKind={(TRADE_KINDS.some((k) => k.value === kind) ? kind : "buy") as TradeKind}
                  accountId={accountId}
                  initialAsset={assetId}
                  lockKind={!!correctId}
                  submitLabel={correctId ? "Correct" : "Save"}
                  onSubmit={(m) => post.mutateAsync(m)}
                  onDone={(tx) => done(tx.id)}
                />
              ) : (
                <MovementForm
                  initial={initial}
                  initialKind={(CASH_TABS.some((k) => k.value === kind) ? kind : "expense") as CashKind}
                  accountId={accountId}
                  lockKind={!!correctId}
                  submitLabel={correctId ? "Correct" : "Save"}
                  onSubmit={(m) => post.mutateAsync(m)}
                  onDone={(tx) => done(tx.id)}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </MoneyPage>
  );
}
