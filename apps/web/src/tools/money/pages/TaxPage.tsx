"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Amount, Units } from "../components/Amount";
import { SimpleSelect } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { formatAmount, formatDate } from "../lib/format";
import { taxCsv } from "../lib/tax-csv";
import { useTaxReport } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AmountJson, TaxReport, TaxSale } from "../types";

function Figure({ label, amount, strong }: { label: string; amount: AmountJson; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "text-base font-semibold")}>{formatAmount(amount)}</dd>
    </div>
  );
}

function download(report: TaxReport) {
  const url = URL.createObjectURL(new Blob([taxCsv(report)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `pit38-${report.year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** The yearly return for investments (PIT-38), worked out from the lots. */
export default function TaxPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear - 1));
  const { data: report, isLoading, isPlaceholderData } = useTaxReport(Number(year));
  const years = Array.from({ length: 12 }, (_, i) => String(thisYear - i));

  return (
    <MoneyPage>
      <PageHeader
        icon={Receipt}
        title="Tax"
        description="PIT-38 from the lots: each sale at the NBP rate of the business day before it, against the PLN cost of the lots it took."
        actions={
          <>
            <div className="w-28">
              <SimpleSelect value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} />
            </div>
            <Button variant="outline" disabled={!report} onClick={() => report && download(report)}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

      {isLoading || !report ? (
        <Skeleton className="h-72" />
      ) : (
        <div className={cn("space-y-6 transition-opacity", isPlaceholderData && "opacity-60")}>
          {report.missing.length > 0 ? (
            <div className="space-y-1 rounded-md border border-dashed px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" /> Not complete: the totals leave these out until their rates arrive
              </div>
              <ul className="list-disc pl-6 text-xs text-muted-foreground">
                {report.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Sales (section C)</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  <Figure label="Revenue" amount={report.totals.revenue} />
                  <Figure label="Costs" amount={report.totals.costs} />
                  <Figure label={report.totals.income.value.startsWith("-") ? "Loss" : "Income"} amount={report.totals.income} />
                  <Figure label="Tax at 19% (whole złoty)" amount={report.totals.tax} strong />
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Dividends and interest from abroad (section G)</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  <Figure label="Gross" amount={report.totals.incomeGross} />
                  <Figure label="19% of the gross" amount={report.totals.incomeTax} />
                  <Figure label="Tax paid abroad, counted" amount={report.totals.incomeCredit} />
                  <Figure label="Left to pay (whole złoty)" amount={report.totals.incomeDue} strong />
                </dl>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">
            Covers the taxable investment accounts ({report.accounts.map((a) => a.name).join(", ") || "none yet"}); bonds and Polish bank interest are taxed at source.
            Proceeds are what arrived, fees deducted, so revenue and costs are both net of the selling fee; the income is the same.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Sales</h2>
            {report.sales.length === 0 ? <EmptyState title={`No sales in ${report.year}`} /> : <SalesTable sales={report.sales} />}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Dividends and interest</h2>
            {report.income.length === 0 ? (
              <EmptyState title={`Nothing received in ${report.year}`} />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">What</th>
                      <th className="px-3 py-2 text-right font-medium">Gross</th>
                      <th className="px-3 py-2 text-right font-medium">Withheld</th>
                      <th className="px-3 py-2 text-right font-medium">NBP rate</th>
                      <th className="px-3 py-2 text-right font-medium">Gross PLN</th>
                      <th className="px-3 py-2 text-right font-medium">Withheld PLN</th>
                      <th className="px-3 py-2 text-right font-medium">19%</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {report.income.map((i) => (
                      <tr key={i.transactionId} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2">
                          <Link className="hover:underline" href={MONEY_ROUTES.transaction(i.transactionId)}>
                            {formatDate(i.date)}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          {i.category}
                          {i.assetCode ? <span className="text-muted-foreground"> · {i.assetCode}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right"><Amount amount={i.gross} /></td>
                        <td className="px-3 py-2 text-right"><Amount amount={i.withheld} muted /></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted-foreground">{i.rate ? `${i.rate} (${formatDate(i.rateDate!)})` : "—"}</td>
                        <td className="px-3 py-2 text-right"><Amount amount={i.grossPln} /></td>
                        <td className="px-3 py-2 text-right"><Amount amount={i.withheldPln} muted /></td>
                        <td className="px-3 py-2 text-right"><Amount amount={i.taxPln} muted /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </MoneyPage>
  );
}

function SalesTable({ sales }: { sales: TaxSale[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Asset</th>
            <th className="px-3 py-2 text-right font-medium">Units</th>
            <th className="px-3 py-2 text-right font-medium">Proceeds</th>
            <th className="px-3 py-2 text-right font-medium">NBP rate</th>
            <th className="px-3 py-2 text-right font-medium">Revenue PLN</th>
            <th className="px-3 py-2 text-right font-medium">Cost PLN</th>
            <th className="px-3 py-2 text-right font-medium">Gain PLN</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sales.map((s) => (
            <Fragment key={s.transactionId}>
              <tr className="border-t">
                <td className="whitespace-nowrap px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 hover:underline" aria-expanded={open === s.transactionId} onClick={() => setOpen(open === s.transactionId ? null : s.transactionId)}>
                    {open === s.transactionId ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {formatDate(s.date)}
                  </button>
                </td>
                <td className="px-3 py-2">
                  {s.assetCode}
                  <span className="text-muted-foreground"> · {s.accountName}</span>
                </td>
                <td className="px-3 py-2 text-right"><Units units={s.units} /></td>
                <td className="px-3 py-2 text-right"><Amount amount={s.proceeds} /></td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted-foreground">{s.rate ? `${s.rate} (${formatDate(s.rateDate!)})` : "—"}</td>
                <td className="px-3 py-2 text-right"><Amount amount={s.proceedsPln} /></td>
                <td className="px-3 py-2 text-right"><Amount amount={s.costPln} muted /></td>
                <td className="px-3 py-2 text-right font-medium"><Amount amount={s.gainPln} signed /></td>
              </tr>
              {open === s.transactionId
                ? s.lots.map((l) => (
                    <tr key={l.lotId} className="bg-muted/20 text-xs">
                      <td className="px-3 py-1.5 pl-8 text-muted-foreground">lot of {formatDate(l.acquiredAt)}</td>
                      <td />
                      <td className="px-3 py-1.5 text-right"><Units units={l.units} /></td>
                      <td className="px-3 py-1.5 text-right"><Amount amount={l.cost} muted /></td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-muted-foreground">{l.rate ? `${l.rate} (${formatDate(l.rateDate!)})` : "—"}</td>
                      <td />
                      <td className="px-3 py-1.5 text-right"><Amount amount={l.costPln} muted /></td>
                      <td />
                    </tr>
                  ))
                : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
