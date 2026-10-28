"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moneyApi } from "../api";
import { normalizeAmountInput, today } from "../lib/format";
import { errorMessage, useInstitutions, useMoneyMutation, useMoneySettings } from "../queries";
import type { AccountResponse, AccountType, CostBasisMethod, InstitutionKind, TaxWrapper } from "../types";
import { AmountInput, CurrencySelect, DateInput, Field, NONE, SimpleSelect } from "./Fields";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank or cash",
  investment: "Investment",
  bonds: "Bonds",
  debt: "Debt",
};

export const INSTITUTION_KIND_LABELS: Record<InstitutionKind, string> = {
  bank: "Bank",
  broker: "Broker",
  bond_registry: "Bond registry",
  lender: "Lender",
  cash: "Cash",
};

const SIGNED_RE = /^[+-]?\d+(\.\d+)?$/;

/** New account: institution (existing or new), type, currencies and what each held at the start. */
export function NewAccountForm({ onDone }: { onDone: (account: AccountResponse) => void }) {
  const { data: institutions } = useInstitutions();
  const { data: settings } = useMoneySettings();
  const [institutionId, setInstitutionId] = useState("");
  const [newInstitution, setNewInstitution] = useState({ name: "", kind: "bank" as InstitutionKind });
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [taxWrapper, setTaxWrapper] = useState<TaxWrapper>("taxable");
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [openings, setOpenings] = useState<Record<string, { amount: string; date: string }>>({});
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const creatingInstitution = institutionId === NONE || (institutions?.length ?? 0) === 0;

  const create = useMoneyMutation(
    async () => {
      let instId = institutionId;
      if (creatingInstitution) {
        if (!newInstitution.name.trim()) throw new Error("Name the institution");
        instId = (await moneyApi.institutions.create({ name: newInstitution.name.trim(), kind: newInstitution.kind })).id;
      }
      const list = currencies.length > 0 ? currencies : [settings?.baseCurrency ?? "PLN"];
      const openingBalances = Object.entries(openings)
        .filter(([code, o]) => list.includes(code) && o.amount.trim())
        .map(([currency, o]) => ({ currency, amount: normalizeAmountInput(o.amount), date: o.date || today() }));
      for (const o of openingBalances) {
        if (!SIGNED_RE.test(o.amount)) throw new Error(`${o.currency}: the opening balance is not an amount`);
      }
      return moneyApi.accounts.create({
        institutionId: instId,
        name: name.trim(),
        type,
        taxWrapper: type === "investment" || type === "bonds" ? taxWrapper : undefined,
        currencies: list,
        openingBalances,
        number: number.trim() || undefined,
      });
    },
    { success: (a) => `${a.name} created`, onSuccess: onDone }
  );

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Name the account");
    if (!creatingInstitution && !institutionId) return setError("Pick the institution");
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
      <Field label="Institution">
        <SimpleSelect
          value={institutionId}
          onChange={setInstitutionId}
          placeholder={(institutions?.length ?? 0) === 0 ? "New institution" : "Pick one"}
          options={[
            ...(institutions ?? []).map((i) => ({ value: i.id, label: i.name })),
            { value: NONE, label: "+ New institution" },
          ]}
        />
      </Field>

      {creatingInstitution ? (
        <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
          <Field label="Institution name" htmlFor="inst-name">
            <Input
              id="inst-name"
              placeholder="mBank, IBKR, Treasury bonds…"
              value={newInstitution.name}
              onChange={(e) => setNewInstitution((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <Field label="Kind">
            <SimpleSelect
              value={newInstitution.kind}
              onChange={(kind) => setNewInstitution((p) => ({ ...p, kind }))}
              options={Object.entries(INSTITUTION_KIND_LABELS).map(([value, label]) => ({
                value: value as InstitutionKind,
                label,
              }))}
            />
          </Field>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account name" htmlFor="acc-name">
          <Input id="acc-name" placeholder="eKonto, Borrowed USD…" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type" hint={type === "debt" ? "Counts as negative in net worth" : undefined}>
          <SimpleSelect
            value={type}
            onChange={setType}
            options={Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value: value as AccountType, label }))}
          />
        </Field>
      </div>

      {type === "investment" || type === "bonds" ? (
        <Field label="Tax" hint="Tax-advantaged accounts (IKE, IKZE) stay out of the tax report">
          <SimpleSelect
            value={taxWrapper}
            onChange={setTaxWrapper}
            options={[
              { value: "taxable", label: "Taxable" },
              { value: "tax_advantaged", label: "Tax-advantaged" },
            ]}
          />
        </Field>
      ) : null}

      <Field label="Currencies" hint="One sub-account per currency; more can be added later">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {currencies.map((c) => (
              <Badge key={c} variant="secondary" className="gap-1 text-sm">
                {c}
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  onClick={() => setCurrencies((list) => list.filter((x) => x !== c))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {currencies.length === 0 ? (
              <span className="text-sm text-muted-foreground">{settings?.baseCurrency ?? "PLN"} if none is picked</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <CurrencySelect value={adding} onChange={setAdding} placeholder="Add a currency" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Add currency"
              disabled={!adding || currencies.includes(adding)}
              onClick={() => {
                setCurrencies((list) => [...list, adding]);
                setAdding("");
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Field>

      <div className="space-y-2">
        <div className="text-sm font-medium">Opening balances</div>
        <p className="text-xs text-muted-foreground">
          What the account held on the day you start tracking it{type === "debt" ? " (the amount owed, with a minus)" : ""}.
        </p>
        {(currencies.length > 0 ? currencies : [settings?.baseCurrency ?? "PLN"]).map((code) => (
          <div key={code} className="grid grid-cols-[4rem_1fr_10rem] items-center gap-2">
            <span className="text-sm font-medium">{code}</span>
            <AmountInput
              value={openings[code]?.amount ?? ""}
              onChange={(amount) => setOpenings((o) => ({ ...o, [code]: { date: o[code]?.date ?? today(), amount } }))}
              allowNegative
            />
            <DateInput
              value={openings[code]?.date ?? today()}
              onChange={(date) => setOpenings((o) => ({ ...o, [code]: { amount: o[code]?.amount ?? "", date } }))}
            />
          </div>
        ))}
      </div>

      <Field label="Account number" htmlFor="acc-number" hint="Optional; recognizes transfers between your accounts in bank statements">
        <Input id="acc-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="PL61 1090 1014 …" />
      </Field>

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

export const COST_BASIS_LABELS: Record<CostBasisMethod, string> = {
  fifo: "First in, first out",
  average: "Average cost",
};
