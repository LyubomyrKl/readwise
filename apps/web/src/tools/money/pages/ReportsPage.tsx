"use client";

import { BarChart3 } from "lucide-react";
import { Segmented } from "../components/Fields";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { useQueryParam } from "../components/useQueryParam";
import { AllocationView } from "../components/views/AllocationView";
import { BasePicker } from "../components/views/BasePicker";
import { MonthlyView } from "../components/views/MonthlyView";
import { NetWorthView } from "../components/views/NetWorthView";
import { SnapshotsView } from "../components/views/SnapshotsView";
import { today } from "../lib/format";
import { RANGES, rangeFrom, suggestBases, type RangeKey } from "../lib/views";
import { useMoneySettings, useNetWorth } from "../queries";

type View = "net-worth" | "monthly" | "allocation" | "snapshots";

/** The three answers in depth, in any base currency: what you own, where the money went, how it is allocated. */
export default function ReportsPage() {
  const [view, setView] = useQueryParam<View>("view", "net-worth");
  const [base, setBase] = useQueryParam<string>("base", "");
  const [range, setRange] = useQueryParam<RangeKey>("range", "12m");
  const [month, setMonth] = useQueryParam<string>("month", "");
  const { data: settings } = useMoneySettings();
  const { data: nw } = useNetWorth(base || undefined);
  const shownBase = base || nw?.base || settings?.baseCurrency || "";
  const from = rangeFrom(range, today().slice(0, 7));

  return (
    <MoneyPage>
      <PageHeader icon={BarChart3} title="Reports" description="Net worth, monthly flow and allocation, in any currency. Rates convert for display only." />

      <div className="space-y-3">
        <Segmented
          scroll
          value={view}
          onChange={setView}
          options={[
            { value: "net-worth", label: "Net worth" },
            { value: "monthly", label: "Monthly" },
            { value: "allocation", label: "Allocation" },
            { value: "snapshots", label: "Snapshots" },
          ]}
        />
        {view !== "snapshots" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <BasePicker
              value={shownBase}
              onChange={(c) => setBase(c === settings?.baseCurrency ? "" : c)}
              suggestions={suggestBases(settings?.baseCurrency, (nw?.currencies ?? []).map((c) => c.name))}
            />
            {view === "net-worth" || view === "monthly" ? <Segmented scroll value={range} onChange={setRange} options={RANGES} /> : null}
          </div>
        ) : null}
      </div>

      {view === "net-worth" ? <NetWorthView base={base || undefined} from={from} /> : null}
      {view === "monthly" ? <MonthlyView base={base || undefined} from={from} month={month} onMonth={setMonth} /> : null}
      {view === "allocation" ? <AllocationView base={base || undefined} /> : null}
      {view === "snapshots" ? <SnapshotsView /> : null}
    </MoneyPage>
  );
}
