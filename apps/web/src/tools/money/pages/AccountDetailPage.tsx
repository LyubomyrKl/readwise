"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Check, Merge, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { moneyApi } from "../api";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_SHORT_LABELS, GroupField, resolveGroup } from "../components/AccountForm";
import { accountCurrencies, AmountInput, CurrencySelect, DateInput, Field, NONE, SimpleSelect } from "../components/Fields";
import { mergeBlocker, mergeCandidates, mergeNameGuess, pickableInstitutions } from "../lib/accounts";
import { MoneyPage, PageHeader } from "../components/PageHeader";
import { TransactionList } from "../components/TransactionList";
import { formatNumber, formatUnits, isNegative, isZero, normalizeAmountInput, today } from "../lib/format";
import { errorMessage, useAccount, useAccounts, useInstitutions, useMoneyMutation, useTransactions } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { AccountResponse, AccountType, SubAccountBalance } from "../types";

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: account, isLoading } = useAccount(id);
  const txs = useTransactions({ accountId: id });
  const [editing, setEditing] = useState(false);
  /** the currency select is open */
  const [adding, setAdding] = useState(false);
  /** the currency whose opening balance is being set */
  const [opening, setOpening] = useState<string | null>(null);
  /** the currency whose account number is being edited */
  const [numbering, setNumbering] = useState<SubAccountBalance | null>(null);
  const [merging, setMerging] = useState(false);

  const archive = useMoneyMutation(
    () => (account?.archivedAt ? moneyApi.accounts.unarchive(id) : moneyApi.accounts.archive(id)),
    { success: (a) => (a.archivedAt ? "Archived; its history stays" : "Back in the lists") }
  );
  const addCurrency = useMoneyMutation((code: string) => moneyApi.accounts.addCurrency(id, code), {
    success: "Currency added",
    onSuccess: () => setAdding(false),
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
            {account.archivedAt ? null : (
              <Button variant="outline" onClick={() => setMerging(true)}>
                <Merge className="mr-1 h-4 w-4" /> Merge into…
              </Button>
            )}
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

      <section className="space-y-3" aria-labelledby="balances-heading">
        <h2 id="balances-heading" className="text-lg font-semibold">
          Balances
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {account.balances.map((b) => (
            <li key={b.subAccountId} className="min-w-0">
              <BalanceTile
                balance={b}
                readOnly={!!account.archivedAt}
                onOpening={() => setOpening(b.commodityId)}
                onNumber={() => setNumbering(b)}
              />
            </li>
          ))}
          {account.archivedAt ? null : (
            <li className="min-w-0">
              {adding ? (
                <div className="flex h-full min-h-[7.5rem] flex-col justify-center gap-2 rounded-lg border border-dashed p-4">
                  {/* picking a currency adds it */}
                  <CurrencySelect
                    value=""
                    onChange={(code) => addCurrency.mutate(code)}
                    exclude={accountCurrencies(account)}
                    placeholder={addCurrency.isPending ? "Adding…" : "Pick a currency to add"}
                  />
                  <Button variant="ghost" size="sm" className="self-end" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-full min-h-[7.5rem] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" /> Add currency
                </button>
              )}
            </li>
          )}
        </ul>
        {account.balances.length === 0 && account.archivedAt ? <p className="text-sm text-muted-foreground">No balances.</p> : null}
      </section>

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

      <Sheet open={opening !== null} onOpenChange={(open) => {
          if (!open) setOpening(null);
        }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Opening balance{opening ? ` in ${opening}` : ""}</SheetTitle>
            <SheetDescription>What {account.name} held on the day you start tracking it; posted as its own transaction.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {opening ? (
              <OpeningBalanceForm account={account} currency={opening} onDone={() => setOpening(null)} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={numbering !== null}
        onOpenChange={(open) => {
          if (!open) setNumbering(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Account number{numbering ? ` for ${numbering.code}` : ""}</SheetTitle>
            <SheetDescription>As bank statements print it; recognizes transfers between your accounts in imports.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {numbering ? <AccountNumberForm account={account} balance={numbering} onDone={() => setNumbering(null)} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={merging} onOpenChange={setMerging}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Merge {account.name} into another account</SheetTitle>
            <SheetDescription>One account with several currencies instead of one account per currency.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{merging ? <MergeAccountForm account={account} /> : null}</div>
        </SheetContent>
      </Sheet>

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

/** One currency (or asset) of the account: code, balance, its number and a menu. */
function BalanceTile({
  balance: b,
  readOnly,
  onOpening,
  onNumber,
}: {
  balance: SubAccountBalance;
  readOnly: boolean;
  onOpening: () => void;
  onNumber: () => void;
}) {
  const cash = b.kind === "currency";
  const empty = cash ? !b.balance || isZero(b.balance.value) : !b.units || isZero(b.units);
  return (
    <div className="flex h-full min-h-[7.5rem] flex-col gap-1 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cash ? b.code : "Units"}</span>
        {cash && !readOnly ? (
          // not modal: the items open a sheet, which takes the focus next
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-7 w-7" aria-label={`${b.code} actions`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpening}>Set opening balance</DropdownMenuItem>
              <DropdownMenuItem onSelect={onNumber}>Account number</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="h-7" aria-hidden />
        )}
      </div>
      <div
        className={cn(
          "truncate text-2xl font-semibold tabular-nums",
          empty && "text-muted-foreground",
          cash && b.balance && isNegative(b.balance.value) && "text-destructive"
        )}
      >
        {cash ? (
          b.balance ? formatNumber(b.balance.value) : "—"
        ) : (
          <>
            {b.units ? formatUnits(b.units) : "—"} <span className="text-base font-medium text-muted-foreground">{b.code}</span>
          </>
        )}
      </div>
      {cash ? (
        b.number ? (
          <div className="truncate font-mono text-xs text-muted-foreground" title={b.number}>
            {b.number}
          </div>
        ) : readOnly ? null : (
          <button
            type="button"
            onClick={onNumber}
            className="self-start rounded text-xs text-muted-foreground/60 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add account number
          </button>
        )
      ) : null}
    </div>
  );
}

/** Pick the account this one merges into, and the merged account's name. */
function MergeAccountForm({ account }: { account: AccountResponse }) {
  const router = useRouter();
  const { data: all, isLoading } = useAccounts(false);
  const blocker = mergeBlocker(account);
  const candidates = mergeCandidates(account, all ?? []);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const target = candidates.find((c) => c.account.id === targetId && !c.reason)?.account ?? null;
  const merge = useMoneyMutation(
    (input: { intoAccountId: string; name?: string }) => moneyApi.accounts.merge(account.id, input),
    {
      success: (a) => `Merged into ${a.name}`,
      onSuccess: (a) => router.push(MONEY_ROUTES.account(a.id)),
    }
  );

  if (blocker) return <p className="text-sm text-muted-foreground">{blocker}.</p>;
  if (isLoading) return <Skeleton className="h-24" />;
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No other {ACCOUNT_TYPE_SHORT_LABELS[account.type].toLowerCase()} account to merge into; only accounts of the same type merge.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!target) return setError("Pick the account to merge into");
        const trimmed = name.trim();
        merge.mutate(
          { intoAccountId: target.id, ...(trimmed && trimmed !== target.name ? { name: trimmed } : {}) },
          { onError: (err) => setError(errorMessage(err)) }
        );
      }}
    >
      <div className="space-y-1.5">
        <div id="merge-into-label" className="text-sm font-medium">
          Merge into
        </div>
        <div role="radiogroup" aria-labelledby="merge-into-label" className="space-y-1.5">
          {candidates.map(({ account: a, reason }) => {
            const selected = a.id === targetId;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!!reason}
                onClick={() => {
                  setTargetId(a.id);
                  setName(mergeNameGuess(account.name, a.name));
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary bg-primary/10" : "hover:bg-muted/40",
                  reason && "cursor-not-allowed opacity-50 hover:bg-transparent"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {reason ?? ([a.institution?.name, a.balances.map((b) => b.code).join(", ")].filter(Boolean).join(" · ") || "No currencies")}
                  </span>
                </span>
                {selected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {target ? (
        <>
          <Field label="Name of the merged account" htmlFor="merge-name">
            <Input id="merge-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={target.name} />
          </Field>
          <p className="text-sm text-muted-foreground">
            {account.name}&apos;s currencies and their history move into {target.name}; {account.name} disappears. Nothing in your
            transactions changes.
          </p>
        </>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={!target || merge.isPending}>
          {merge.isPending ? "Merging…" : target ? `Merge into ${target.name}` : "Merge"}
        </Button>
      </div>
    </form>
  );
}

function EditAccountForm({ account, onDone }: { account: AccountResponse; onDone: () => void }) {
  const { data: allInstitutions } = useInstitutions();
  const { data: allAccounts } = useAccounts(true);
  const all = allInstitutions ?? [];
  // the account's own group stays on offer even when every other account in it is archived
  const groups = allAccounts
    ? all.filter((g) => g.id === account.institution?.id || pickableInstitutions([g], allAccounts).length > 0)
    : all;
  const [name, setName] = useState(account.name);
  const [groupId, setGroupId] = useState<string>(account.institution?.id ?? NONE);
  const [newGroupName, setNewGroupName] = useState("");
  const [type, setType] = useState<AccountType>(account.type);
  const [error, setError] = useState<string | null>(null);
  const save = useMoneyMutation(
    async () => {
      const institutionId = await resolveGroup(groupId, newGroupName, all);
      return moneyApi.accounts.update(account.id, {
        name: name.trim(),
        institutionId,
        type,
      });
    },
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
        setError(null);
        if (!name.trim()) return setError("Name the account");
        save.mutate(undefined, { onError: (err) => setError(errorMessage(err)) });
      }}
    >
      <Field label="Name" htmlFor="edit-name">
        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type">
        <SimpleSelect value={type} onChange={setType} options={typeOptions} />
      </Field>
      <GroupField groups={groups} value={groupId} onChange={setGroupId} newName={newGroupName} onNewName={setNewGroupName} />
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** The IBAN or account number of one currency; empty clears it. */
function AccountNumberForm({ account, balance, onDone }: { account: AccountResponse; balance: SubAccountBalance; onDone: () => void }) {
  const [number, setNumber] = useState(balance.number ?? "");
  const save = useMoneyMutation(() => moneyApi.accounts.setNumber(account.id, balance.commodityId, number.trim() || null), {
    success: number.trim() ? "Account number saved" : "Account number cleared",
    onSuccess: onDone,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <Field label={`Account number (${balance.code})`} htmlFor="sub-number" hint="Leave empty to clear it">
        <Input
          id="sub-number"
          className="font-mono"
          placeholder="PL61 1090 1014 …"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

const SIGNED_RE = /^[+-]?\d+(\.\d+)?$/;

/** An opening balance for one currency of the account: a signed amount on a day. */
function OpeningBalanceForm({ account, currency, onDone }: { account: AccountResponse; currency: string; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const post = useMoneyMutation(
    (input: { date: string; accountId: string; currency: string; amount: string }) =>
      moneyApi.movements.post({ kind: "opening_balance", input }),
    { success: "Opening balance posted", onSuccess: onDone }
  );
  function submit() {
    setError(null);
    const value = normalizeAmountInput(amount);
    if (!SIGNED_RE.test(value)) return setError("Enter an amount");
    if (!date) return setError("Pick a date");
    post.mutate({ date, accountId: account.id, currency, amount: value }, { onError: (e) => setError(errorMessage(e)) });
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Balance (${currency})`} htmlFor="ob-amount" hint="Negative for money owed">
          <AmountInput id="ob-amount" value={amount} onChange={setAmount} allowNegative />
        </Field>
        <Field label="Date" htmlFor="ob-date">
          <DateInput id="ob-date" value={date} onChange={setDate} />
        </Field>
      </div>
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={post.isPending}>
          {post.isPending ? "Posting…" : "Post opening balance"}
        </Button>
      </div>
    </form>
  );
}
