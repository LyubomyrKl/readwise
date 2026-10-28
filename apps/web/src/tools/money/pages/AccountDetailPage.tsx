"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyApi } from "../api";
import { ACCOUNT_TYPE_LABELS, COST_BASIS_LABELS } from "../components/AccountForm";
import { Amount, Units } from "../components/Amount";
import { CurrencySelect, Field, NONE, SimpleSelect } from "../components/Fields";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { TransactionList } from "../components/TransactionList";
import { useAccount, useInstitutions, useMoneyMutation, useTransactions } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AccountResponse, AccountType, CostBasisMethod, TaxWrapper } from "../types";

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: account, isLoading } = useAccount(id);
  const txs = useTransactions({ accountId: id });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState("");

  const archive = useMoneyMutation(
    () => (account?.archivedAt ? moneyApi.accounts.unarchive(id) : moneyApi.accounts.archive(id)),
    { success: (a) => (a.archivedAt ? "Archived; its history stays" : "Back in the lists") }
  );
  const addCurrency = useMoneyMutation((code: string) => moneyApi.accounts.addCurrency(id, code), {
    success: "Currency added",
    onSuccess: () => setAdding(""),
  });

  if (isLoading || !account) {
    return (
      <MoneyPage>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </MoneyPage>
    );
  }

  const items = txs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <MoneyPage>
      <Link href={MONEY_ROUTES.accounts} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Accounts
      </Link>
      <PageHeader
        title={account.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {account.institution?.name}
            <Badge variant="secondary">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
            {account.taxWrapper === "tax_advantaged" ? <Badge variant="outline">Tax-advantaged</Badge> : null}
            {account.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
          </span>
        }
        actions={
          <>
            {account.archivedAt ? null : (
              <Button asChild>
                <Link href={`${MONEY_ROUTES.newMovement()}?account=${account.id}`}>
                  <Plus className="mr-1 h-4 w-4" /> Movement
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" onClick={() => archive.mutate(undefined)} disabled={archive.isPending}>
              {account.archivedAt ? (
                <>
                  <ArchiveRestore className="mr-1 h-4 w-4" /> Unarchive
                </>
              ) : (
                <>
                  <Archive className="mr-1 h-4 w-4" /> Archive
                </>
              )}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {account.balances.map((b) => (
            <div key={b.subAccountId} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{b.code}</span>
              {b.kind === "currency" ? <Amount amount={b.balance} className="text-base font-medium" /> : <Units units={b.units} />}
            </div>
          ))}
          {account.archivedAt ? null : (
            <div className="flex gap-2 pt-2">
              <div className="flex-1">
                <CurrencySelect value={adding} onChange={setAdding} placeholder="Add a currency" />
              </div>
              <Button variant="outline" disabled={!adding || addCurrency.isPending} onClick={() => addCurrency.mutate(adding)}>
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Transactions</h2>
        <TransactionList items={items} highlightAccountId={account.id} />
        {txs.hasNextPage ? (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => void txs.fetchNextPage()} disabled={txs.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit {account.name}</SheetTitle>
            <SheetDescription>Balances and history do not change.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <EditAccountForm account={account} onDone={() => setEditing(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </MoneyPage>
  );
}

function EditAccountForm({ account, onDone }: { account: AccountResponse; onDone: () => void }) {
  const { data: institutions } = useInstitutions();
  const [name, setName] = useState(account.name);
  const [institutionId, setInstitutionId] = useState(account.institution?.id ?? "");
  const [type, setType] = useState<AccountType>(account.type);
  const [taxWrapper, setTaxWrapper] = useState<TaxWrapper>(account.taxWrapper);
  const [costBasis, setCostBasis] = useState<CostBasisMethod | typeof NONE>(account.costBasisMethod ?? NONE);
  const [number, setNumber] = useState(account.number ?? "");
  const save = useMoneyMutation(
    () =>
      moneyApi.accounts.update(account.id, {
        name: name.trim(),
        institutionId,
        type,
        taxWrapper,
        costBasisMethod: costBasis === NONE ? null : costBasis,
        number: number.trim() || null,
      }),
    { success: "Saved", onSuccess: onDone }
  );
  const typeOptions = (Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[])
    .filter((t) => (account.type === "debt" ? t === "debt" : t !== "debt"))
    .map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Field label="Name" htmlFor="edit-name">
        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Institution">
        <SimpleSelect
          value={institutionId}
          onChange={setInstitutionId}
          options={(institutions ?? []).map((i) => ({ value: i.id, label: i.name }))}
        />
      </Field>
      <Field label="Type">
        <SimpleSelect value={type} onChange={setType} options={typeOptions} />
      </Field>
      {type === "investment" || type === "bonds" ? (
        <>
          <Field label="Tax">
            <SimpleSelect
              value={taxWrapper}
              onChange={setTaxWrapper}
              options={[
                { value: "taxable", label: "Taxable" },
                { value: "tax_advantaged", label: "Tax-advantaged" },
              ]}
            />
          </Field>
          <Field label="Cost basis method" hint="Which lots a sale takes; the default comes from the money settings">
            <SimpleSelect
              value={costBasis}
              onChange={setCostBasis}
              options={[
                { value: NONE, label: "Default" },
                ...(Object.keys(COST_BASIS_LABELS) as CostBasisMethod[]).map((m) => ({ value: m, label: COST_BASIS_LABELS[m] })),
              ]}
            />
          </Field>
        </>
      ) : null}
      <Field label="Account number" htmlFor="edit-number">
        <Input id="edit-number" value={number} onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
