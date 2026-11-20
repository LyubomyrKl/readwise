"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PenLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BackLink, useBack } from "@platform/ui/BackLink";
import { moneyApi } from "../api";
import { Segmented } from "../components/Fields";
import { CASH_TABS, MovementForm, type CashKind } from "../components/MovementForm";
import { TradeForm, TRADE_KINDS, type TradeKind } from "../components/TradeForm";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { useMoneyMutation } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { Movement } from "../types";

/**
 * Records a movement. Saved, it goes back where the form was opened (an account, the list), which
 * shows it; changing one later happens on the movement's own page.
 */
export default function NewMovementPage() {
  const params = useSearchParams();
  const kind = params.get("kind") ?? "expense";
  const accountId = params.get("account") ?? undefined;
  const assetId = params.get("asset") ?? undefined;
  const back = useBack(MONEY_ROUTES.transactions);
  const post = useMoneyMutation((movement: Movement) => moneyApi.movements.post(movement), { success: "Saved" });
  const [area, setArea] = useState<"money" | "investments">(TRADE_KINDS.some((k) => k.value === kind) ? "investments" : "money");

  return (
    <MoneyPage>
      <BackLink fallback={MONEY_ROUTES.transactions} />
      <PageHeader icon={PenLine} title="New movement" description="Money in, money out, or between your accounts." />
      <Card>
        <CardContent className="space-y-5">
          <Segmented
            value={area}
            onChange={setArea}
            options={[
              { value: "money", label: "Money" },
              { value: "investments", label: "Investments" },
            ]}
          />
          {area === "investments" ? (
            <TradeForm
              initialKind={(TRADE_KINDS.some((k) => k.value === kind) ? kind : "buy") as TradeKind}
              accountId={accountId}
              initialAsset={assetId}
              onSubmit={post.mutateAsync}
              onDone={back}
            />
          ) : (
            <MovementForm
              initialKind={(CASH_TABS.some((k) => k.value === kind) ? kind : "expense") as CashKind}
              accountId={accountId}
              onSubmit={post.mutateAsync}
              onDone={back}
            />
          )}
        </CardContent>
      </Card>
    </MoneyPage>
  );
}
