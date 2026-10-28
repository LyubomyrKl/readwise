"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, FileUp, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { moneyApi } from "../api";
import { Amount } from "../components/Amount";
import { AccountSelect, AmountInput, CurrencySelect, DateInput, Field, NONE, Segmented, SimpleSelect } from "../components/Fields";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { describeProposal } from "../lib/proposal";
import { formatDate, normalizeAmountInput, today } from "../lib/format";
import { useAccounts, useImportBalances, useImportBatch, useImportProfiles, useImportRows, useMoneyMutation } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { ImportBatch, ImportColumns, ImportMapping, ImportRowStatus, ImportTypeValues } from "../types";

const STATUS_LABELS: Record<ImportRowStatus, string> = {
  pending: "Pending",
  ready: "To import",
  duplicate: "Imported before",
  matched: "Already in the ledger",
  imported: "Imported",
  skipped: "Skipped",
  error: "Needs attention",
};

const DATE_FORMATS = ["auto", "YYYY-MM-DD", "DD.MM.YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "YYYY/MM/DD"];

export default function ImportBatchPage() {
  const { id } = useParams<{ id: string }>();
  const { data: batch, isLoading } = useImportBatch(id);
  const { data: profiles } = useImportProfiles();
  const router = useRouter();
  const remove = useMoneyMutation(() => moneyApi.imports.remove(id), {
    success: "Import dropped",
    onSuccess: () => router.push(MONEY_ROUTES.imports),
  });

  if (isLoading || !batch) {
    return (
      <MoneyPage>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </MoneyPage>
    );
  }

  const profile = profiles?.find((p) => p.id === batch.profile);
  const open = batch.status === "preview";
  const mapped = !!batch.mapping || !profile?.needsMapping;

  return (
    <MoneyPage>
      <Link href={MONEY_ROUTES.imports} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Imports
      </Link>
      <PageHeader
        icon={FileUp}
        title={batch.fileName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {profile?.label ?? batch.profile}
            <span>· {batch.rowCount} lines</span>
            {batch.encoding ? <span>· {batch.encoding}</span> : null}
            <Badge variant={open ? "outline" : "default"}>{open ? "In review" : "Committed"}</Badge>
          </span>
        }
        actions={
          open ? (
            <Button variant="ghost" onClick={() => remove.mutate(undefined)} disabled={remove.isPending}>
              <Trash2 className="mr-1 h-4 w-4" /> Drop
            </Button>
          ) : null
        }
      />

      {open && profile?.needsMapping ? <MappingCard batch={batch} /> : null}
      {open && profile?.needsMapping && batch.mapping && batch.accountNames.length > 0 ? <AccountsCard batch={batch} /> : null}
      {mapped ? <ReviewCard batch={batch} /> : null}
      {open && mapped ? <BalancesCard batch={batch} /> : null}
      {open && mapped ? <CommitCard batch={batch} /> : null}
    </MoneyPage>
  );
}

// ---- 1. columns -------------------------------------------------------------------------

const COLUMN_FIELDS: { key: keyof Omit<ImportColumns, "note">; label: string; required?: boolean; hint?: string }[] = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "account", label: "Account" },
  { key: "type", label: "Type", hint: "income / expense / transfer" },
  { key: "category", label: "Category" },
  { key: "subcategory", label: "Subcategory" },
  { key: "currency", label: "Currency" },
  { key: "toAccount", label: "Transfer: to account" },
  { key: "toAmount", label: "Transfer: amount received" },
  { key: "toCurrency", label: "Transfer: currency received" },
];

const TYPE_FIELDS: { key: keyof ImportTypeValues; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "expense", label: "Expense" },
  { key: "transfer", label: "Transfer (one row, with a target account)" },
  { key: "transferOut", label: "Transfer, sending half" },
  { key: "transferIn", label: "Transfer, receiving half" },
];

function emptyMapping(): ImportMapping {
  return {
    headerRow: 0,
    columns: { date: 0, amount: 1, note: [] },
    dateFormat: "auto",
    decimalSeparator: "auto",
    defaultCurrency: "PLN",
    amountSign: "signed",
    typeValues: { income: [], expense: [], transfer: [], transferOut: [], transferIn: [] },
    accounts: {},
  };
}

function MappingCard({ batch }: { batch: ImportBatch }) {
  const [mapping, setMapping] = useState<ImportMapping>(() => batch.mapping ?? batch.suggestedMapping ?? emptyMapping());
  const [typeText, setTypeText] = useState<Record<keyof ImportTypeValues, string>>(() => {
    const tv = (batch.mapping ?? batch.suggestedMapping ?? emptyMapping()).typeValues;
    return {
      income: tv.income.join(", "),
      expense: tv.expense.join(", "),
      transfer: tv.transfer.join(", "),
      transferOut: tv.transferOut.join(", "),
      transferIn: tv.transferIn.join(", "),
    };
  });
  const header = batch.head[mapping.headerRow] ?? [];
  const columnOptions = [
    { value: NONE, label: "—" },
    ...header.map((h, i) => ({ value: String(i), label: `${i + 1} · ${h || "(empty)"}` })),
  ];
  const setColumn = (key: keyof ImportColumns, value: string) =>
    setMapping((m) => ({ ...m, columns: { ...m.columns, [key]: value === NONE ? undefined : Number(value) } }));
  const notes = mapping.columns.note ?? [];

  const apply = useMoneyMutation(
    () => {
      const split = (s: string) => s.split(",").map((v) => v.trim()).filter(Boolean);
      const typeValues = {
        income: split(typeText.income),
        expense: split(typeText.expense),
        transfer: split(typeText.transfer),
        transferOut: split(typeText.transferOut),
        transferIn: split(typeText.transferIn),
      };
      return moneyApi.imports.mapping(batch.id, { ...mapping, typeValues, accounts: batch.mapping?.accounts ?? mapping.accounts });
    },
    { success: "Mapping applied" }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Columns</CardTitle>
        <CardDescription>Tell the import which column holds what. The first lines of the file:</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <tbody>
              {batch.head.map((row, i) => (
                <tr key={i} className={cn("border-b last:border-0", i === mapping.headerRow && "bg-primary/10 font-medium")}>
                  <td className="px-2 py-1 text-muted-foreground">{i}</td>
                  {row.map((c, j) => (
                    <td key={j} className="max-w-48 truncate px-2 py-1" title={c}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Header row" hint="The highlighted line">
            <Input
              type="number"
              min={0}
              max={batch.head.length - 1}
              value={mapping.headerRow}
              onChange={(e) => setMapping((m) => ({ ...m, headerRow: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </Field>
          <Field label="Date format">
            <SimpleSelect
              value={mapping.dateFormat}
              onChange={(dateFormat) => setMapping((m) => ({ ...m, dateFormat }))}
              options={DATE_FORMATS.map((f) => ({ value: f, label: f === "auto" ? "Detect" : f }))}
            />
          </Field>
          <Field label="Decimal separator">
            <SimpleSelect
              value={mapping.decimalSeparator}
              onChange={(decimalSeparator: ImportMapping["decimalSeparator"]) => setMapping((m) => ({ ...m, decimalSeparator }))}
              options={[
                { value: "auto", label: "Detect" },
                { value: ".", label: "Dot (1,234.56)" },
                { value: ",", label: "Comma (1 234,56)" },
              ]}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {COLUMN_FIELDS.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
              <SimpleSelect
                value={mapping.columns[f.key] === undefined ? NONE : String(mapping.columns[f.key])}
                onChange={(v) => setColumn(f.key, v)}
                options={f.required ? columnOptions.slice(1) : columnOptions}
              />
            </Field>
          ))}
          {[0, 1].map((n) => (
            <Field key={`note-${n}`} label={`Note ${n + 1}`}>
              <SimpleSelect
                value={notes[n] === undefined ? NONE : String(notes[n])}
                onChange={(v) =>
                  setMapping((m) => {
                    const next = [...(m.columns.note ?? [])];
                    if (v === NONE) next.splice(n, 1);
                    else next[n] = Number(v);
                    return { ...m, columns: { ...m.columns, note: next.filter((x) => x !== undefined) } };
                  })
                }
                options={columnOptions}
              />
            </Field>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amounts" hint="Signed: a minus means money out. By type: the type column decides.">
            <SimpleSelect
              value={mapping.amountSign}
              onChange={(amountSign: ImportMapping["amountSign"]) => setMapping((m) => ({ ...m, amountSign }))}
              options={[
                { value: "signed", label: "Signed" },
                { value: "type", label: "By type column" },
              ]}
            />
          </Field>
          <Field label="Currency when the file has none">
            <CurrencySelect value={mapping.defaultCurrency} onChange={(defaultCurrency) => setMapping((m) => ({ ...m, defaultCurrency }))} />
          </Field>
        </div>

        {mapping.columns.type !== undefined ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="text-sm font-medium">Type values</div>
            {batch.typeValuesFound.length > 0 ? (
              <div className="flex flex-wrap gap-1 text-xs">
                <span className="text-muted-foreground">In the file:</span>
                {batch.typeValuesFound.map((v) => (
                  <Badge key={v} variant="secondary">
                    {v}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPE_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint="Comma-separated">
                  <Input value={typeText[f.key]} onChange={(e) => setTypeText((t) => ({ ...t, [f.key]: e.target.value }))} />
                </Field>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button onClick={() => apply.mutate(undefined)} disabled={apply.isPending}>
            {apply.isPending ? "Reading rows…" : batch.mapping ? "Apply again" : "Apply"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- 2. accounts ------------------------------------------------------------------------

function AccountsCard({ batch }: { batch: ImportBatch }) {
  const mapping = batch.mapping!;
  const [accounts, setAccounts] = useState<Record<string, string>>(mapping.accounts);
  const [institutionName, setInstitutionName] = useState("Imported");
  useEffect(() => setAccounts(mapping.accounts), [mapping.accounts]);
  const unmapped = batch.accountNames.filter((n) => !accounts[n]);
  const save = useMoneyMutation(() => moneyApi.imports.mapping(batch.id, { ...mapping, accounts }), { success: "Accounts mapped" });
  const create = useMoneyMutation(() => moneyApi.imports.createAccounts(batch.id, unmapped, institutionName), {
    success: `${unmapped.length} accounts created`,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Accounts</CardTitle>
        <CardDescription>Each account name in the file belongs to one of your accounts, or a new one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {batch.accountNames.map((name) => (
            <div key={name} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
              <span className="truncate text-sm font-medium">{name}</span>
              <AccountSelect value={accounts[name] ?? ""} onChange={(id) => setAccounts((a) => ({ ...a, [name]: id }))} placeholder="Not mapped" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {unmapped.length > 0 ? (
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Institution for new accounts" className="sm:w-56">
                <Input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} />
              </Field>
              <Button variant="outline" onClick={() => create.mutate(undefined)} disabled={create.isPending}>
                Create {unmapped.length} unmapped
              </Button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Every account is mapped.</span>
          )}
          <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
            Save mapping
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- 3. review --------------------------------------------------------------------------

function ReviewCard({ batch }: { batch: ImportBatch }) {
  const statuses = (Object.keys(STATUS_LABELS) as ImportRowStatus[]).filter((s) => (batch.counts[s] ?? 0) > 0);
  const [status, setStatus] = useState<string>(statuses.includes("error") ? "error" : (statuses[0] ?? "all"));
  const [offset, setOffset] = useState(0);
  // after a re-mapping the chosen status may have no rows left: show the first one that has some
  const available = statuses.join(",");
  useEffect(() => {
    const list = available ? available.split(",") : [];
    if (status !== "all" && !list.includes(status)) {
      setStatus(list.includes("error") ? "error" : (list[0] ?? "all"));
      setOffset(0);
    }
  }, [available, status]);
  const { data: page, isLoading } = useImportRows(batch.id, status, offset);
  const { data: accounts } = useAccounts(true);
  const nameOf = useMemo(() => (id: string) => accounts?.find((a) => a.id === id)?.name ?? "?", [accounts]);
  const decide = useMoneyMutation(({ rowId, next }: { rowId: string; next: "ready" | "skipped" }) =>
    moneyApi.imports.decide(batch.id, rowId, next)
  );
  const open = batch.status === "preview";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{open ? "3. Review" : "Rows"}</CardTitle>
        <CardDescription>
          Rows imported before and movements already in the ledger are held back; include one if it really is new.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Segmented
          value={status}
          onChange={(s) => {
            setStatus(s);
            setOffset(0);
          }}
          options={[
            ...statuses.map((s) => ({ value: s, label: `${STATUS_LABELS[s]} ${batch.counts[s]}` })),
            { value: "all", label: `All ${batch.rowCount}` },
          ]}
        />
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="divide-y rounded-md border">
            {(page?.items ?? []).map((row) => {
              const d = row.proposal ? describeProposal(row.proposal, nameOf) : null;
              const canToggle = open && !!row.proposal && !row.proposal.matchOnly && row.status !== "imported";
              return (
                <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{row.rowNumber}</span>
                      {d ? (
                        <>
                          <span className="text-xs text-muted-foreground">{formatDate(d.date)}</span>
                          <span className="truncate font-medium">{d.title}</span>
                        </>
                      ) : (
                        <span className="truncate text-muted-foreground">{row.raw.join(" · ")}</span>
                      )}
                    </div>
                    {d?.detail ? <div className="truncate text-xs text-muted-foreground">{d.detail}</div> : null}
                    {row.message ? <div className="text-xs text-muted-foreground">{row.message}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {d?.amount ? <span className={cn("tabular-nums", d.negative && "text-destructive")}>{d.amount}</span> : null}
                    <Badge variant={row.status === "error" ? "destructive" : row.status === "ready" ? "default" : "secondary"}>
                      {STATUS_LABELS[row.status]}
                    </Badge>
                    {canToggle ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => decide.mutate({ rowId: row.id, next: row.status === "ready" ? "skipped" : "ready" })}
                      >
                        {row.status === "ready" ? "Skip" : "Include"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {(page?.items ?? []).length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No rows</li> : null}
          </ul>
        )}
        {page && page.total > 100 ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {offset + 1}–{Math.min(offset + 100, page.total)} of {page.total}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 100))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={offset + 100 >= page.total} onClick={() => setOffset((o) => o + 100)}>
                Next
              </Button>
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---- 4. balances ------------------------------------------------------------------------

function BalancesCard({ batch }: { batch: ImportBatch }) {
  const { data: previews } = useImportBalances(batch.id, true);
  const [targets, setTargets] = useState<Record<string, { balance: string; asOf: string }>>({});
  useEffect(() => {
    if (!previews) return;
    setTargets(
      Object.fromEntries(
        previews.map((p) => [
          `${p.accountId}/${p.currency}`,
          { balance: p.target?.value ?? p.after.value, asOf: p.asOf ?? today() },
        ])
      )
    );
  }, [previews]);
  const save = useMoneyMutation(
    () =>
      moneyApi.imports.setBalances(
        batch.id,
        (previews ?? []).map((p) => {
          const t = targets[`${p.accountId}/${p.currency}`];
          return { accountId: p.accountId, currency: p.currency, balance: normalizeAmountInput(t?.balance ?? p.after.value), asOf: t?.asOf };
        })
      ),
    { success: "Opening balances worked out" }
  );
  if (!previews || previews.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Today&apos;s balances</CardTitle>
        <CardDescription>
          Enter what each bank shows. The difference to the imported history becomes an opening balance dated the day
          before the first movement, so every account ends exactly where the bank says.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {previews.map((p) => {
          const key = `${p.accountId}/${p.currency}`;
          const t = targets[key] ?? { balance: "", asOf: today() };
          return (
            <div key={key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1 text-sm">
                <div className="font-medium">
                  {p.accountName} · {p.currency}
                </div>
                <div className="text-xs text-muted-foreground">
                  Now <Amount amount={p.before} muted /> · import <Amount amount={p.change} signed muted /> · after{" "}
                  <Amount amount={p.after} muted />
                </div>
                {p.openingBalance ? (
                  <div className="text-xs">
                    Opening balance <Amount amount={p.openingBalance} signed /> on {p.openingDate ? formatDate(p.openingDate) : "—"}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-80">
                <AmountInput
                  value={t.balance}
                  allowNegative
                  onChange={(balance) => setTargets((all) => ({ ...all, [key]: { ...t, balance } }))}
                />
                <DateInput value={t.asOf} onChange={(asOf) => setTargets((all) => ({ ...all, [key]: { ...t, asOf } }))} />
              </div>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => save.mutate(undefined)} disabled={save.isPending}>
            Work out opening balances
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- 5. commit --------------------------------------------------------------------------

function CommitCard({ batch }: { batch: ImportBatch }) {
  const router = useRouter();
  const commit = useMoneyMutation(() => moneyApi.imports.commit(batch.id), {
    success: (r) =>
      `Imported ${r.imported} movements${r.openingBalances ? ` and ${r.openingBalances} opening balances` : ""}`,
    onSuccess: () => router.push(MONEY_ROUTES.accounts),
  });
  const ready = batch.counts.ready ?? 0;
  const errors = batch.counts.error ?? 0;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="font-medium">{ready} movements will be posted.</div>
          <div className="text-muted-foreground">
            {errors > 0 ? `${errors} rows still need attention and will be left out. ` : ""}All or nothing: one database transaction.
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={ready === 0 || commit.isPending}>
              <Check className="mr-1 h-4 w-4" /> {commit.isPending ? "Posting…" : "Commit"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Post {ready} movements?</AlertDialogTitle>
              <AlertDialogDescription>
                They become part of the ledger with the opening balances worked out above. Mistakes are fixed later by
                reversing, never by deleting.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not yet</AlertDialogCancel>
              <AlertDialogAction onClick={() => commit.mutate(undefined)}>Commit</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
