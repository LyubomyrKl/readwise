"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { moneyApi } from "../api";
import { accountLabel, CurrencySelect, DateInput, Field, NONE, SimpleSelect } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { formatDate, formatValue, normalizePercentInput, percent, today } from "../lib/format";
import { errorMessage, useAccounts, useAssetClasses, useAssets, useMoneyMutation } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AssetResponse, Valuation } from "../types";

const VALUATION_LABELS: Record<Valuation, string> = {
  manual: "Prices entered by hand",
  price_feed: "Price feed",
  bond_formula: "Bond formula (EDO-style)",
};

export default function AssetsPage() {
  const { data: assets } = useAssets(true);
  const { data: classes } = useAssetClasses();
  const [editing, setEditing] = useState<AssetResponse | "new" | null>(null);

  return (
    <MoneyPage>
      <Link href={MONEY_ROUTES.investments} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Investments
      </Link>
      <PageHeader
        icon={Tag}
        title="Assets and classes"
        description="Any instrument, how it is valued, and the classes your allocation targets."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> New asset
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
        </CardHeader>
        <CardContent>
          {(assets ?? []).length === 0 ? (
            <EmptyState title="No assets yet">VWCE, EDO bonds, anything you hold.</EmptyState>
          ) : (
            <ul className="divide-y">
              {(assets ?? []).map((a) => (
                <li key={a.id}>
                  <button type="button" className="flex w-full items-start justify-between gap-3 py-2 text-left hover:bg-muted/30" onClick={() => setEditing(a)}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {a.code} {a.archived ? <Badge variant="outline">Archived</Badge> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.name} · {a.quoteCurrency} · {VALUATION_LABELS[a.valuation]}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      {a.latestPrice ? (
                        <span className="tabular-nums">
                          {formatValue(a.latestPrice.price, a.latestPrice.currency)} · {formatDate(a.latestPrice.date)}
                        </span>
                      ) : null}
                      <span className="flex flex-wrap justify-end gap-1">
                        {a.classes.map((c) => (
                          <Badge key={c.classId} variant="secondary">
                            {classes?.find((k) => k.id === c.classId)?.name ?? "?"} {percent(c.percent, 0)}
                          </Badge>
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ClassesCard />
      <CashClassesCard />

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "New asset" : editing ? `Edit ${editing.code}` : ""}</SheetTitle>
            <SheetDescription>Nothing about an instrument is fixed in code; describe it here.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {editing ? <AssetForm asset={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </MoneyPage>
  );
}

interface SeriesRow {
  from: string;
  firstYearRate: string;
  margin: string;
}

function bondFields(config: Record<string, unknown> | null) {
  const c = (config ?? {}) as { nominal?: string; termYears?: number; series?: SeriesRow[]; inflation?: Record<string, string> };
  return {
    nominal: c.nominal ?? "100.00",
    termYears: String(c.termYears ?? 10),
    series: c.series?.length ? c.series : [{ from: today(), firstYearRate: "", margin: "" }],
    inflation: Object.entries(c.inflation ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, v]) => `${m} ${v}`)
      .join("\n"),
  };
}

function AssetForm({ asset, onDone }: { asset: AssetResponse | null; onDone: () => void }) {
  const { data: classes } = useAssetClasses();
  const [code, setCode] = useState(asset?.code ?? "");
  const [name, setName] = useState(asset?.name ?? "");
  const [quoteCurrency, setQuoteCurrency] = useState(asset?.quoteCurrency ?? "EUR");
  const [unitName, setUnitName] = useState(asset?.unitName ?? "units");
  const [ticker, setTicker] = useState(asset?.ticker ?? "");
  const [isin, setIsin] = useState(asset?.isin ?? "");
  const [valuation, setValuation] = useState<Valuation>(asset?.valuation ?? "manual");
  const [feedSymbol, setFeedSymbol] = useState(String((asset?.valuationConfig as { symbol?: string } | null)?.symbol ?? ""));
  const [bond, setBond] = useState(() => bondFields(asset?.valuation === "bond_formula" ? asset.valuationConfig : null));
  const [shares, setShares] = useState<{ classId: string; percent: string }[]>(asset?.classes ?? []);
  const [error, setError] = useState<string | null>(null);

  function valuationConfig(): Record<string, unknown> | undefined {
    if (valuation === "price_feed") return { provider: "yahoo", symbol: feedSymbol.trim() };
    if (valuation === "bond_formula") {
      const inflation: Record<string, string> = {};
      for (const line of bond.inflation.split("\n")) {
        const [month, value] = line.trim().split(/[\s;,=:]+/);
        if (month && value) inflation[month] = value.replace(",", ".");
      }
      return {
        nominal: bond.nominal.replace(",", "."),
        termYears: Number(bond.termYears),
        series: bond.series.map((s) => ({ ...s, firstYearRate: s.firstYearRate.replace(",", "."), margin: s.margin.replace(",", ".") })),
        inflation,
      };
    }
    return undefined;
  }

  const save = useMoneyMutation(
    async () => {
      const config = valuationConfig();
      const classes = shares
        .map((s) => ({ classId: s.classId, percent: normalizePercentInput(s.percent) }))
        .filter((s) => s.classId && s.percent);
      if (asset) {
        await moneyApi.assets.update(asset.id, {
          code,
          name,
          unitName,
          ticker: ticker.trim() || null,
          isin: isin.trim() || null,
          valuation,
          valuationConfig: config,
        });
        return moneyApi.assets.setClasses(asset.id, classes);
      }
      return moneyApi.assets.create({
        code,
        name,
        quoteCurrency,
        unitName,
        ticker: ticker.trim() || undefined,
        isin: isin.trim() || undefined,
        valuation,
        valuationConfig: config,
        classes,
      });
    },
    { success: "Saved", onSuccess: onDone }
  );
  const archive = useMoneyMutation(() => moneyApi.assets.update(asset!.id, { archived: !asset!.archived }), { onSuccess: onDone });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!code.trim() || !name.trim()) return setError("Code and name, please");
        save.mutate(undefined, { onError: (err) => setError(err instanceof Error ? err.message : String(err)) });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Code">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VWCE" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vanguard FTSE All-World" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quote currency" hint={asset ? "Fixed once prices exist" : undefined}>
          {asset ? <Input value={quoteCurrency} disabled /> : <CurrencySelect value={quoteCurrency} onChange={setQuoteCurrency} />}
        </Field>
        <Field label="Unit" hint="units, bonds of 100 PLN…">
          <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} />
        </Field>
        <Field label="ISIN" hint="Optional">
          <Input value={isin} onChange={(e) => setIsin(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Exchange ticker" hint="Optional; broker imports match it">
          <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="VWCE.DE" />
        </Field>
      </div>
      <Field label="Value">
        <SimpleSelect
          value={valuation}
          onChange={setValuation}
          options={(Object.keys(VALUATION_LABELS) as Valuation[]).map((v) => ({ value: v, label: VALUATION_LABELS[v] }))}
        />
      </Field>
      {valuation === "price_feed" ? (
        <Field label="Feed symbol" hint="Yahoo Finance symbol, e.g. VWCE.DE; fetched every evening">
          <Input value={feedSymbol} onChange={(e) => setFeedSymbol(e.target.value)} placeholder="vwce.de" />
        </Field>
      ) : null}
      {valuation === "bond_formula" ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nominal per bond">
              <Input value={bond.nominal} onChange={(e) => setBond((b) => ({ ...b, nominal: e.target.value }))} />
            </Field>
            <Field label="Years">
              <Input value={bond.termYears} onChange={(e) => setBond((b) => ({ ...b, termYears: e.target.value.replace(/\D/g, "") }))} />
            </Field>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Series</div>
            <p className="text-xs text-muted-foreground">Bought from a day on: first-year rate and margin over inflation, in percent.</p>
            {bond.series.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_5rem] gap-2">
                <DateInput
                  value={s.from}
                  onChange={(from) => setBond((b) => ({ ...b, series: b.series.map((x, j) => (j === i ? { ...x, from } : x)) }))}
                />
                <Input
                  placeholder="5.60"
                  value={s.firstYearRate}
                  onChange={(e) => setBond((b) => ({ ...b, series: b.series.map((x, j) => (j === i ? { ...x, firstYearRate: e.target.value } : x)) }))}
                />
                <Input
                  placeholder="2.00"
                  value={s.margin}
                  onChange={(e) => setBond((b) => ({ ...b, series: b.series.map((x, j) => (j === i ? { ...x, margin: e.target.value } : x)) }))}
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setBond((b) => ({ ...b, series: [...b.series, { from: today(), firstYearRate: "", margin: "" }] }))}
            >
              Add a series
            </Button>
          </div>
          <Field label="Inflation by month" hint="One per line: 2026-06 3.1 (year on year, percent)">
            <Textarea rows={4} value={bond.inflation} onChange={(e) => setBond((b) => ({ ...b, inflation: e.target.value }))} />
          </Field>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-sm font-medium">Asset classes</div>
        <p className="text-xs text-muted-foreground">One asset can sit in several classes; the shares add up to at most 100%.</p>
        {shares.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2">
            <SimpleSelect
              value={s.classId}
              onChange={(classId) => setShares((all) => all.map((x, j) => (j === i ? { ...x, classId } : x)))}
              options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Class"
            />
            <Input value={s.percent} onChange={(e) => setShares((all) => all.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} placeholder="%" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShares((all) => all.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={(classes ?? []).length === 0}
          onClick={() => setShares((all) => [...all, { classId: "", percent: all.length === 0 ? "100" : "" }])}
        >
          {(classes ?? []).length === 0 ? "Create a class first" : "Add a class"}
        </Button>
      </div>

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div> : null}
      <div className="flex justify-between">
        {asset ? (
          <Button type="button" variant="ghost" onClick={() => archive.mutate(undefined)}>
            {asset.archived ? "Unarchive" : "Archive"}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function ClassesCard() {
  const { data: classes } = useAssetClasses();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMoneyMutation(
    () => moneyApi.classes.create({ name: name.trim(), targetPercent: normalizePercentInput(target) || undefined }),
    {
      success: "Class added",
      onSuccess: () => {
        setName("");
        setTarget("");
      },
    }
  );
  const total = (classes ?? []).reduce((sum, c) => sum + (c.targetPercent ? Number(c.targetPercent) : 0), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Asset classes and targets</CardTitle>
        <CardDescription>
          Core equity, satellite, emergency fund — your list. A new target applies from its day; older ones stay as history.
          {classes && classes.length > 0 ? ` Current targets add up to ${total.toFixed(2).replace(/\.00$/, "")}%.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(classes ?? []).map((c) => (
          <ClassRow key={c.id} classId={c.id} name={c.name} targetPercent={c.targetPercent} validFrom={c.targetValidFrom} history={c.targets} />
        ))}
        <form
          className="grid gap-2 sm:grid-cols-[1fr_7rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (name.trim()) create.mutate(undefined, { onError: (err) => setError(errorMessage(err)) });
          }}
        >
          <Field label="New class">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency fund" />
          </Field>
          <Field label="Target %">
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10" />
          </Field>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            Add
          </Button>
        </form>
        {error ? <FormError message={error} /> : null}
      </CardContent>
    </Card>
  );
}

function ClassRow({
  classId,
  name,
  targetPercent,
  validFrom,
  history,
}: {
  classId: string;
  name: string;
  targetPercent: string | null;
  validFrom: string | null;
  history: { percent: string; validFrom: string }[];
}) {
  const [value, setValue] = useState(targetPercent ?? "");
  const [from, setFrom] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const save = useMoneyMutation(() => moneyApi.classes.setTarget(classId, normalizePercentInput(value), from), {
    success: "Target saved",
    onSuccess: () => setError(null),
  });
  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_6rem_10rem_auto] sm:items-end">
      <div className="text-sm">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">
          {targetPercent ? `Target ${percent(targetPercent, 0)} since ${formatDate(validFrom!)}` : "No target yet"}
          {history.length > 1 ? ` · ${history.length - 1} earlier` : ""}
        </div>
      </div>
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="%" aria-label={`${name} target percent`} />
      <DateInput value={from} onChange={setFrom} />
      <Button
        variant="outline"
        onClick={() => save.mutate(undefined, { onError: (err) => setError(errorMessage(err)) })}
        disabled={!normalizePercentInput(value) || save.isPending}
      >
        Set target
      </Button>
      {error ? (
        <div className="sm:col-span-4">
          <FormError message={error} />
        </div>
      ) : null}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{message}</div>;
}

function CashClassesCard() {
  const { data: accounts } = useAccounts();
  const { data: classes } = useAssetClasses();
  const update = useMoneyMutation(({ id, cashClassId }: { id: string; cashClassId: string | null }) => moneyApi.accounts.update(id, { cashClassId }), {
    success: "Saved",
  });
  const list = (accounts ?? []).filter((a) => a.type !== "debt");
  if ((classes ?? []).length === 0 || list.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash in the allocation</CardTitle>
        <CardDescription>Cash held in an account can count towards a class (a savings account as the emergency fund).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
            <span className="truncate text-sm">{accountLabel(a)}</span>
            <SimpleSelect
              value={a.cashClassId ?? NONE}
              onChange={(v) => update.mutate({ id: a.id, cashClassId: v === NONE ? null : v })}
              options={[{ value: NONE, label: "Not in a class" }, ...(classes ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
