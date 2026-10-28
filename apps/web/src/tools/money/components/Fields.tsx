"use client";

import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAccounts, useCategories, useCurrencies } from "../queries";
import type { AccountResponse, CategoryResponse } from "../types";

/** Radix Select cannot hold an empty value; this stands for "none". */
export const NONE = "__none";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  // ties the label to the control: an explicit id, else one generated and given to a single child
  const generated = useId();
  const single = isValidElement<{ id?: string }>(children) ? children : null;
  const id = htmlFor ?? single?.props.id ?? (single ? generated : undefined);
  const control = single && !single.props.id && !htmlFor ? cloneElement(single, { id }) : children;
  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function AmountInput({
  id,
  value,
  onChange,
  placeholder = "0.00",
  allowNegative = false,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowNegative?: boolean;
  className?: string;
}) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      className={cn("tabular-nums", className)}
      onChange={(e) => {
        const next = e.target.value;
        const allowed = allowNegative ? /^[-+]?[\d\s.,']*$/ : /^[\d\s.,']*$/;
        if (allowed.test(next)) onChange(next);
      }}
    />
  );
}

export function DateInput({ id, value, onChange }: { id?: string; value: string; onChange: (value: string) => void }) {
  return <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function CurrencySelect({
  id,
  value,
  onChange,
  only,
  placeholder = "Currency",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** restrict to these codes (e.g. the account's sub-accounts) */
  only?: string[];
  placeholder?: string;
}) {
  const { data: currencies } = useCurrencies();
  const list = (currencies ?? []).filter((c) => !only || only.includes(c.code));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {list.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code} <span className="text-muted-foreground">· {c.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function accountLabel(a: Pick<AccountResponse, "name" | "institution">): string {
  return a.institution && a.institution.name !== a.name ? `${a.institution.name} · ${a.name}` : a.name;
}

export function AccountSelect({
  id,
  value,
  onChange,
  filter,
  placeholder = "Account",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  filter?: (account: AccountResponse) => boolean;
  placeholder?: string;
}) {
  const { data: accounts } = useAccounts();
  const list = (accounts ?? []).filter((a) => !filter || filter(a));
  const groups = new Map<string, AccountResponse[]>();
  for (const a of list) {
    const key = a.institution?.name ?? "Other";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {[...groups.entries()].map(([institution, items]) => (
          <SelectGroup key={institution}>
            <SelectLabel>{institution}</SelectLabel>
            {items.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The currencies an account holds (its currency sub-accounts). */
export function accountCurrencies(account: AccountResponse | undefined): string[] {
  return (account?.balances ?? []).filter((b) => b.kind === "currency").map((b) => b.commodityId);
}

export function categoryPath(category: CategoryResponse, all: CategoryResponse[]): string {
  const parent = category.parentId ? all.find((c) => c.id === category.parentId) : undefined;
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

export function CategorySelect({
  id,
  kind,
  value,
  onChange,
  allowNone = true,
  placeholder = "Category",
}: {
  id?: string;
  kind: "income" | "expense";
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
  placeholder?: string;
}) {
  const { data: categories } = useCategories();
  const all = categories ?? [];
  const list = all
    .filter((c) => c.kind === kind)
    .map((c) => ({ id: c.id, label: categoryPath(c, all) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {allowNone ? (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">{kind === "income" ? "Other income" : "Other expenses"}</span>
          </SelectItem>
        ) : null}
        {list.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A row of mutually exclusive buttons (form kinds, filters). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            value === o.value ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SimpleSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  id?: string;
  value: T | "";
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Every category in one list, grouped by kind, for filters; "" means all. */
export function CategoryFilterSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { data: categories } = useCategories();
  const all = categories ?? [];
  const group = (kind: "income" | "expense") =>
    all
      .filter((c) => c.kind === kind)
      .map((c) => ({ id: c.id, label: categoryPath(c, all) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="All categories" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={NONE}>All categories</SelectItem>
        {(["expense", "income"] as const).map((kind) => (
          <SelectGroup key={kind}>
            <SelectLabel>{kind === "expense" ? "Expenses" : "Income"}</SelectLabel>
            {group(kind).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
