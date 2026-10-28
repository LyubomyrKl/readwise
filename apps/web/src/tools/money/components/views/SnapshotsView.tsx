"use client";

import { useState } from "react";
import { Camera, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyApi } from "../../api";
import { quarterLabel } from "../../lib/chart";
import { formatAmount, formatDate, today } from "../../lib/format";
import { useMoneyMutation, useSnapshot, useSnapshots } from "../../queries";
import type { SnapshotResponse } from "../../types";
import { Amount, Units } from "../Amount";
import { EmptyState } from "../PageHeader";
import { DateInput, Field } from "../Fields";
import { DataTable } from "../charts/ChartFrame";
import { AllocationRows } from "./AllocationView";
import { NetWorthHeadline } from "./NetWorthView";

/** Quarterly checkpoints: net worth, positions and allocation frozen as they were. */
export function SnapshotsView() {
  const { data, isLoading } = useSnapshots();
  const [date, setDate] = useState(today());
  const [label, setLabel] = useState("");
  const take = useMoneyMutation(() => moneyApi.snapshots.take({ date, label: label.trim() || quarterLabel(date) }), {
    success: (s) => `Snapshot of ${formatDate(s.date)} saved`,
    onSuccess: () => setLabel(""),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Take a snapshot</CardTitle>
          <p className="text-xs text-muted-foreground">
            Freezes net worth, positions and allocation at the end of a day, in the base currency of your settings. One per day; taking it again replaces it.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              take.mutate(undefined);
            }}
          >
            <Field label="Day">
              <DateInput value={date} onChange={setDate} />
            </Field>
            <Field label="Label">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={quarterLabel(date || today())} maxLength={60} />
            </Field>
            <Button type="submit" disabled={take.isPending || !date}>
              <Camera className="mr-1 h-4 w-4" /> Take snapshot
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No snapshots yet">One is taken at each quarter end once automation runs; take one now above.</EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(data ?? []).map((s) => (
            <SnapshotRow key={s.id} snapshot={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SnapshotRow({ snapshot }: { snapshot: SnapshotResponse }) {
  const [open, setOpen] = useState(false);
  const full = useSnapshot(open ? snapshot.id : undefined);
  const data = full.data?.data;
  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/30" aria-expanded={open}>
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="truncate font-medium">{snapshot.label ?? formatDate(snapshot.date)}</span>
          {snapshot.label ? <span className="shrink-0 text-xs text-muted-foreground">{formatDate(snapshot.date)}</span> : null}
        </span>
        <span className="shrink-0 tabular-nums">{formatAmount(snapshot.netWorth)}</span>
      </button>
      {open ? (
        <div className="space-y-6 border-t bg-muted/10 px-4 py-4">
          {full.isLoading || !data ? (
            <Skeleton className="h-32" />
          ) : (
            <>
              <NetWorthHeadline nw={data.netWorth} />
              <div className="grid gap-6 md:grid-cols-2">
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">By type</h3>
                  <DataTable head={["", "Value"]} rows={data.netWorth.types.map((t) => ({ key: t.key ?? t.name, cells: [t.name, <Amount key="v" amount={t.value} />] }))} />
                </section>
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Allocation</h3>
                  <AllocationRows allocation={data.allocation} />
                </section>
              </div>
              {data.positions.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Positions</h3>
                  <DataTable
                    head={["", "Units", "Cost", "Value"]}
                    rows={data.positions.map((p) => ({
                      key: `${p.accountId}-${p.assetId}`,
                      cells: [
                        `${p.code} · ${p.accountName}`,
                        <Units key="u" units={p.units} />,
                        <span key="c">{p.cost.map((c) => formatAmount(c)).join(" + ")}</span>,
                        <Amount key="v" amount={p.value} />,
                      ],
                    }))}
                  />
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
