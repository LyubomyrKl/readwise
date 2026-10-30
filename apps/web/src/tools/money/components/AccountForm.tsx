"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moneyApi } from "../api";
import { normalizeAmountInput, today } from "../lib/format";
import { pickableInstitutions } from "../lib/accounts";
import { errorMessage, useAccounts, useInstitutions, useMoneyMutation, useMoneySettings } from "../queries";
import type { AccountResponse, AccountType, InstitutionKind, InstitutionResponse } from "../types";
import { AmountInput, CurrencySelect, DateInput, Field, NONE, SimpleSelect } from "./Fields";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank or cash",
  investment: "Investment",
  bonds: "Bonds",
  debt: "Debt",
};

/** The same, short enough for a table column. */
export const ACCOUNT_TYPE_SHORT_LABELS: Record<AccountType, string> = {
  bank: "Bank",
  investment: "Investment",
  bonds: "Bonds",
  debt: "Debt",
};

/** A group is an institution on the API, which still asks for a kind; it changes nothing, so every new one is a "bank". */
const NEW_GROUP_KIND: InstitutionKind = "bank";

/** The group select's value for "type a new one". */
export const NEW_GROUP = "__new";

const SIGNED_RE = /^[+-]?\d+(\.\d+)?$/;

/**
 * The group an account goes in: none (NONE), an existing one, or a new one by
 * name (an existing group of that name is reused). Returns its id, or null.
 */
export async function resolveGroup(choice: string, newName: string, groups: InstitutionResponse[]): Promise<string | null> {
  if (choice !== NEW_GROUP) return choice && choice !== NONE ? choice : null;
  const name = newName.trim();
  if (!name) throw new Error("Name the group, or pick No group");
  const same = groups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase());
  if (same) return same.id;
  return (await moneyApi.institutions.create({ name, kind: NEW_GROUP_KIND })).id;
}

/** Optional group: none, an existing one, or a new name. */
export function GroupField({
  groups,
  value,
  onChange,
  newName,
  onNewName,
}: {
  groups: InstitutionResponse[];
  value: string;
  onChange: (value: string) => void;
  newName: string;
  onNewName: (name: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Field label="Group" hint="Optional; e.g. mBank or Cash. Accounts in no group are listed under Other">
        <SimpleSelect
          value={value}
          onChange={onChange}
          options={[
            { value: NONE, label: <span className="text-muted-foreground">No group</span> },
            ...groups.map((g) => ({ value: g.id, label: g.name })),
            { value: NEW_GROUP, label: "+ New group" },
          ]}
        />
      </Field>
      {value === NEW_GROUP ? (
        <Input aria-label="New group name" placeholder="mBank, Cash, IBKR…" value={newName} onChange={(e) => onNewName(e.target.value)} autoFocus />
      ) : null}
    </div>
  );
}

interface CurrencyRow {
  amount: string;
  date: string;
  number: string;
}

/** New account: name, type, an optional group, then each currency with its opening balance and number. */
export function NewAccountForm({ onDone }: { onDone: (account: AccountResponse) => void }) {
  const { data: allInstitutions } = useInstitutions();
  const { data: allAccounts } = useAccounts(true);
  const { data: settings } = useMoneySettings();
  // a group whose accounts are all archived is not offered again
  const groups = (allInstitutions && allAccounts ? pickableInstitutions(allInstitutions, allAccounts) : allInstitutions) ?? [];
  const [groupId, setGroupId] = useState<string>(NONE);
  const [newGroupName, setNewGroupName] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, CurrencyRow>>({});
  const [error, setError] = useState<string | null>(null);
  const base = settings?.baseCurrency ?? "PLN";
  const list = currencies.length > 0 ? currencies : [base];
  const row = (code: string): CurrencyRow => rows[code] ?? { amount: "", date: today(), number: "" };
  const setRow = (code: string, patch: Partial<CurrencyRow>) => setRows((r) => ({ ...r, [code]: { ...row(code), ...patch } }));

  const create = useMoneyMutation(
    async () => {
      const openingBalances = list
        .filter((code) => row(code).amount.trim())
        .map((currency) => ({ currency, amount: normalizeAmountInput(row(currency).amount), date: row(currency).date || today() }));
      for (const o of openingBalances) {
        if (!SIGNED_RE.test(o.amount)) throw new Error(`${o.currency}: the opening balance is not an amount`);
      }
      const numbers = list
        .filter((code) => row(code).number.trim())
        .map((currency) => ({ currency, number: row(currency).number.trim() }));
      const institutionId = await resolveGroup(groupId, newGroupName, allInstitutions ?? []);
      return moneyApi.accounts.create({
        ...(institutionId ? { institutionId } : {}),
        name: name.trim(),
        type,
        currencies: list,
        openingBalances,
        ...(numbers.length > 0 ? { numbers } : {}),
      });
    },
    { success: (a) => `${a.name} created`, onSuccess: onDone }
  );

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Name the account");
    if (groupId === NEW_GROUP && !newGroupName.trim()) return setError("Name the group, or pick No group");
    create.mutate(undefined, { onError: (e) => setError(errorMessage(e)) });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="acc-name">
          <Input id="acc-name" placeholder="eKonto, Wallet, Borrowed USD…" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type" hint={type === "debt" ? "Counts as negative in net worth" : undefined}>
          <SimpleSelect
            value={type}
            onChange={setType}
            options={Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value: value as AccountType, label }))}
          />
        </Field>
      </div>

      <GroupField groups={groups} value={groupId} onChange={setGroupId} newName={newGroupName} onNewName={setNewGroupName} />

      <div className="space-y-2">
        <div className="text-sm font-medium">Currencies</div>
        <p className="text-xs text-muted-foreground">
          One balance per currency, with what it held on the day you start tracking it
          {type === "debt" ? " (the amount owed, with a minus)" : ""}. More can be added later.
        </p>
        <div className="space-y-2">
          {list.map((code) => (
            <div key={code} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{code}</span>
                {currencies.length > 0 ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${code}`}
                    onClick={() => setCurrencies((l) => l.filter((x) => x !== code))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">Base currency</span>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                <AmountInput
                  value={row(code).amount}
                  onChange={(amount) => setRow(code, { amount })}
                  placeholder="Opening balance"
                  allowNegative
                />
                <DateInput value={row(code).date} onChange={(date) => setRow(code, { date })} />
              </div>
              <Input
                aria-label={`${code} account number`}
                className="font-mono text-xs"
                placeholder="Account number or IBAN (optional)"
                value={row(code).number}
                onChange={(e) => setRow(code, { number: e.target.value })}
              />
            </div>
          ))}
        </div>
        {/* picking a currency adds it; the select stays empty for the next one */}
        <CurrencySelect
          value=""
          // the rows on screen stay (the base currency included); each can be removed
          onChange={(code) => setCurrencies(list.includes(code) ? list : [...list, code])}
          exclude={list}
          placeholder="Add a currency"
        />
        <p className="text-xs text-muted-foreground">An account number recognizes transfers between your accounts in bank statements.</p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
