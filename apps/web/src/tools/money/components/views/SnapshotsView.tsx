"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronDown, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyApi } from "../../api";
import { quarterLabel } from "../../lib/chart";
import { downloadCsv, snapshotFilename, snapshotsCsv } from "../../lib/csv";
import { formatAmount, formatDate, today } from "../../lib/format";
import { errorMessage, moneyKeys, useMoneyMutation, useSnapshot, useSnapshots } from "../../queries";
import type { SnapshotResponse } from "../../types";
import { Amount, Units } from "../Amount";
import { EmptyState } from "../PageHeader";
import { DateInput, Field } from "../Fields";
import { DataTable } from "../charts/ChartFrame";
import { AllocationRows } from "./AllocationView";
import { NetWorthHeadline } from "./NetWorthView";

/** Fetches the full snapshots (through the query cache) and downloads them as one CSV. */
function useSnapshotExport() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function exportCsv(list: SnapshotResponse[], key: string) {
    setBusy(key);
    try {
      const full = await Promise.all(
        list.map((s) => qc.fetchQuery({ queryKey: moneyKeys.snapshot(s.id), queryFn: () => moneyApi.snapshots.get(s.id) }))
      );
      downloadCsv(snapshotFilename(list.length === 1 ? list[0] : undefined), snapshotsCsv(full));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }
  return { busy, exportCsv };
}

/** Quarterly checkpoints: net worth, positions and allocation frozen as they were. */
export function SnapshotsView() {
  const { data, isLoading } = useSnapshots();
  const { busy, exportCsv } = useSnapshotExport();
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
        <section className="space-y-2" aria-labelledby="snapshots-heading">
          <div className="flex items-center justify-between gap-2">
            <h2 id="snapshots-heading" className="text-sm font-medium">
              Snapshots
            </h2>
            <Button variant="outline" size="sm" onClick={() => void exportCsv(data ?? [], "all")} disabled={busy !== null}>
              <Download className="mr-1 h-4 w-4" /> {busy === "all" ? "Exporting…" : "Export all (CSV)"}
            </Button>
          </div>
          <ul className="divide-y rounded-lg border">
            {(data ?? []).map((s) => (
              <SnapshotRow
                key={s.id}
                snapshot={s}
                exporting={busy === s.id}
                onExport={busy === null ? () => void exportCsv([s], s.id) : undefined}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SnapshotRow({
  snapshot,
  exporting,
  onExport,
}: {
  snapshot: SnapshotResponse;
  exporting: boolean;
  /** undefined while an export runs */
  onExport?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const full = useSnapshot(open ? snapshot.id : undefined);
  const data = full.data?.data;
  return (
    <li>
      <div className="flex items-center gap-1 pr-2 hover:bg-muted/30">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pl-4 pr-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={open}>
          <span className="flex min-w-0 items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <span className="truncate font-medium">{snapshot.label ?? formatDate(snapshot.date)}</span>
            {snapshot.label ? <span className="shrink-0 text-xs text-muted-foreground">{formatDate(snapshot.date)}</span> : null}
          </span>
          <span className="shrink-0 tabular-nums">{formatAmount(snapshot.netWorth)}</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onExport}
          disabled={!onExport}
          aria-label={`Download ${snapshot.label ?? formatDate(snapshot.date)} as CSV`}
          title="Download CSV"
        >
          <Download className={exporting ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
        </Button>
      </div>
      {open ? (
        <div className="space-y-6 border-t bg-muted/10 px-4 py-4">
          {full.isLoading || !data ? (
            <Skeleton className="h-32" />
          ) : (
            <>
              <NetWorthHeadline nw={data.netWorth} />
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-6">
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">By type</h3>
                    <DataTable head={["", "Value"]} rows={data.netWorth.types.map((t) => ({ key: t.key ?? t.name, cells: [t.name, <Amount key="v" amount={t.value} />] }))} />
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">By currency</h3>
                    <DataTable
                      head={["", "Held", "Value"]}
                      rows={data.netWorth.currencies.map((c) => ({
                        key: c.key ?? c.name,
                        cells: [c.name, <span key="n">{c.native ? formatAmount(c.native) : "—"}</span>, <Amount key="v" amount={c.value} />],
                      }))}
                    />
                  </section>
                </div>
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Allocation</h3>
                  <AllocationRows allocation={data.allocation} />
                </section>
              </div>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Accounts</h3>
                <DataTable
                  head={["", "Held", "Value"]}
                  rows={data.netWorth.accounts
                    .filter((a) => a.value.minor !== "0" || a.items.some((i) => i.native && i.native.minor !== "0"))
                    .map((a) => ({
                      key: a.accountId,
                      cells: [
                        a.institution && a.institution !== a.name ? `${a.name} · ${a.institution}` : a.name,
                        <span key="h">
                          {a.items
                            .filter((i) => i.native && i.native.minor !== "0")
                            .map((i) => (i.kind === "asset" && i.units ? `${i.units} ${i.code}` : formatAmount(i.native!)))
                            .join(" + ") || "—"}
                        </span>,
                        <Amount key="v" amount={a.value} />,
                      ],
                    }))}
                />
              </section>
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
