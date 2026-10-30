"use client";

import { useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { moneyApi } from "../api";
import { formatAmount, formatDate, formatValue, normalizeAmountInput, today } from "../lib/format";
import { useAutomation, useMoneyMutation, useRates } from "../queries";
import type { AmountJson, AutomationJob, MoneyTask } from "../types";
import { AmountInput, CurrencySelect, DateInput, Field } from "./Fields";

const TASK_NAMES: Record<MoneyTask, string> = {
  snapshot: "Quarter-end snapshot",
  rates: "Exchange rates (ECB, NBP)",
  prices: "Prices (Yahoo Finance)",
};
const SOURCE_NAMES: Record<string, string> = { ecb: "ECB", nbp: "NBP", manual: "By hand" };
const ACTIVE = ["queued", "running", "waiting"];

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** One line on what the last run did. */
function outcome(task: MoneyTask, job: AutomationJob): string {
  if (job.status === "failed" || job.status === "cancelled") return job.error ?? job.status;
  if (ACTIVE.includes(job.status)) return job.status === "queued" ? "waiting for the worker" : "running";
  const r = (job.result ?? {}) as Record<string, unknown>;
  switch (task) {
    case "rates": {
      const ecb = r.ecb as { latest?: string | null } | undefined;
      const nbp = r.nbp as { latest?: string | null } | undefined;
      const lots = Number(r.lotsFilled ?? 0);
      return `ECB to ${ecb?.latest ? formatDate(ecb.latest) : "—"}, NBP to ${nbp?.latest ? formatDate(nbp.latest) : "—"}${lots ? `; ${lots} lots got their PLN cost` : ""}`;
    }
    case "prices": {
      const assets = (r.assets as { code: string; error?: string }[] | undefined) ?? [];
      const failed = assets.filter((a) => a.error);
      return `${assets.length - failed.length} of ${assets.length} prices${failed.length ? `; ${failed.map((a) => `${a.code}: ${a.error}`).join("; ")}` : ""}`;
    }
    case "snapshot": {
      const nw = r.netWorth as AmountJson | undefined;
      return nw ? `net worth ${formatAmount(nw)}` : "taken";
    }
  }
}

/** What runs on its own each day, when it last ran, and a button to run it now. */
export function AutomationCard() {
  const { data } = useAutomation();
  const run = useMoneyMutation((task: MoneyTask) => moneyApi.automation.run(task), { success: "Started" });
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runs on its own</CardTitle>
        <CardDescription>
          Every day in {data.timeZone}: rates at 17:15, prices at 18:30, and a snapshot after each quarter ends.
          {data.scheduler ? null : " The daily schedule is off on this server; run them here."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="divide-y rounded-md border">
          {data.tasks.flatMap((t) => (t.task === "recurring" ? [] : [{ ...t, task: t.task }])).map(({ task, startsAt, lastJob }) => (
            <li key={task} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {TASK_NAMES[task]} <span className="text-xs font-normal text-muted-foreground">{task === "snapshot" ? "quarter ends" : `daily ${startsAt}`}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {lastJob ? `${when(lastJob.createdAt)} · ${outcome(task, lastJob)}` : "Not run yet"}
                </div>
              </div>
              {lastJob ? (
                <Badge variant={lastJob.status === "failed" ? "destructive" : lastJob.status === "succeeded" ? "secondary" : "outline"}>{lastJob.status}</Badge>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={run.isPending || (!!lastJob && ACTIVE.includes(lastJob.status))}
                onClick={() => run.mutate(task)}
              >
                <Play className="mr-1 h-3.5 w-3.5" /> Run now
              </Button>
            </li>
          ))}
        </ul>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Rates stored</h3>
            <dl className="divide-y text-sm">
              {data.rates.map((r) => (
                <div key={r.source} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-muted-foreground">{SOURCE_NAMES[r.source]}</dt>
                  <dd className="tabular-nums">{r.latest ? `${formatDate(r.first!)} – ${formatDate(r.latest)}` : "none"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Price feed</h3>
            {data.priceFeeds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No asset is valued by the feed; set it on an asset under Investments.</p>
            ) : (
              <dl className="divide-y text-sm">
                {data.priceFeeds.map((p) => (
                  <div key={p.assetId} className="flex justify-between gap-3 py-1.5">
                    <dt>
                      {p.code} <span className="text-xs text-muted-foreground">{p.symbol}</span>
                    </dt>
                    <dd className="tabular-nums">{p.latest ? `${formatValue(p.latest.price, p.latest.currency)} · ${formatDate(p.latest.date)}` : "no price yet"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

/** Rates typed in by hand, for a currency or a day the feeds do not cover. */
export function RatesCard() {
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("PLN");
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState("");
  const { data: rows } = useRates({ from, to });
  const add = useMoneyMutation(() => moneyApi.rates.create({ date, from, to, rate: normalizeAmountInput(rate) }), {
    success: "Rate saved",
    onSuccess: () => setRate(""),
  });
  const remove = useMoneyMutation((id: string) => moneyApi.rates.remove(id), { success: "Removed" });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exchange rates</CardTitle>
        <CardDescription>
          For display only; a rate typed in wins over the feeds for its day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid items-end gap-3 sm:grid-cols-[8rem_8rem_10rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(undefined);
          }}
        >
          <Field label="From">
            <CurrencySelect value={from} onChange={setFrom} />
          </Field>
          <Field label="To">
            <CurrencySelect value={to} onChange={setTo} />
          </Field>
          <Field label="Day">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={`1 ${from} in ${to}`}>
            <AmountInput value={rate} onChange={setRate} placeholder="4.2650" />
          </Field>
          <Button type="submit" disabled={!rate || from === to || add.isPending}>
            Add
          </Button>
        </form>
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Day</th>
                <th className="px-3 py-1.5 text-left font-medium">Source</th>
                <th className="px-3 py-1.5 text-right font-medium">
                  1 {from} in {to}
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(rows ?? []).slice(0, 60).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-1.5">{formatDate(r.date)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{SOURCE_NAMES[r.source]}</td>
                  <td className="px-3 py-1.5 text-right">{r.rate}</td>
                  <td className="px-1 text-right">
                    {r.source === "manual" ? (
                      <Button size="sm" variant="ghost" aria-label="Remove this rate" onClick={() => remove.mutate(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {(rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    No {from}/{to} rate stored; the feeds publish against EUR (ECB) and PLN (NBP), and other pairs are crossed through them.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
