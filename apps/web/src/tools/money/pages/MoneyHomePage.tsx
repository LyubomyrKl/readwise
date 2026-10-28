"use client";

import { Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrencies } from "@tools/money/queries";

/** Placeholder until the views of M4: shows the tool is wired to its API. */
export default function MoneyHomePage() {
  const { data: currencies, isLoading, error } = useCurrencies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Money
        </h1>
        <p className="text-muted-foreground mt-1">
          Net worth, monthly flow and allocation, from one double-entry ledger.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foundation</CardTitle>
          <CardDescription>Accounts and movements arrive in the next milestone.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {isLoading && "Loading currencies…"}
          {error && "Could not load currencies."}
          {currencies && `${currencies.length} currencies supported.`}
        </CardContent>
      </Card>
    </div>
  );
}
