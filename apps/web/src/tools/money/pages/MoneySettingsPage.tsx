"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PLATFORM_ROUTES } from "@platform/routes";
import { moneyApi } from "../api";
import { COST_BASIS_LABELS } from "../components/AccountForm";
import { categoryPath, CurrencySelect, Field, NONE, SimpleSelect } from "../components/Fields";
import { useCategories, useMoneyMutation, useMoneySettings } from "../queries";
import type { CategoryResponse, CostBasisMethod } from "../types";

export default function MoneySettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href={PLATFORM_ROUTES.settings.root}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6" />
          Money
        </h1>
        <p className="mt-1 text-muted-foreground">Base currency, tax rules and categories</p>
      </div>
      <GeneralCard />
      <CategoriesCard />
    </div>
  );
}

function GeneralCard() {
  const { data: settings } = useMoneySettings();
  const save = useMoneyMutation(moneyApi.settings.update, { success: "Saved" });
  const [residence, setResidence] = useState<string | null>(null);
  if (!settings) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          The base currency only changes how totals are shown; stored amounts stay what actually moved.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Field label="Base currency">
          <CurrencySelect value={settings.baseCurrency} onChange={(baseCurrency) => save.mutate({ baseCurrency })} />
        </Field>
        <Field label="Cost basis method" hint="Accounts may override it">
          <SimpleSelect
            value={settings.defaultCostBasis}
            onChange={(defaultCostBasis: CostBasisMethod) => save.mutate({ defaultCostBasis })}
            options={(Object.keys(COST_BASIS_LABELS) as CostBasisMethod[]).map((m) => ({ value: m, label: COST_BASIS_LABELS[m] }))}
          />
        </Field>
        <Field label="Tax residence" hint="Two letters; PL uses NBP rates for the tax report">
          <div className="flex gap-2">
            <Input
              maxLength={2}
              value={residence ?? settings.taxResidence}
              onChange={(e) => setResidence(e.target.value.toUpperCase())}
            />
            <Button
              variant="outline"
              disabled={!residence || residence === settings.taxResidence || !/^[A-Z]{2}$/.test(residence)}
              onClick={() => save.mutate({ taxResidence: residence! }, { onSuccess: () => setResidence(null) })}
            >
              Save
            </Button>
          </div>
        </Field>
      </CardContent>
    </Card>
  );
}

function CategoriesCard() {
  const { data: categories } = useCategories(true);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [parentId, setParentId] = useState<string>(NONE);
  const create = useMoneyMutation(
    () => moneyApi.categories.create({ name: name.trim(), kind, parentId: parentId === NONE ? null : parentId }),
    { success: "Category added", onSuccess: () => setName("") }
  );
  const all = categories ?? [];
  const parents = all.filter((c) => c.kind === kind && !c.parentId && !c.archived);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>Income and expense categories; nest one level. Archived ones keep their history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_9rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate(undefined);
          }}
        >
          <Field label="Name" htmlFor="cat-name">
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurants" />
          </Field>
          <Field label="Kind">
            <SimpleSelect
              value={kind}
              onChange={(k: "income" | "expense") => {
                setKind(k);
                setParentId(NONE);
              }}
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
            />
          </Field>
          <Field label="Inside">
            <SimpleSelect
              value={parentId}
              onChange={setParentId}
              options={[{ value: NONE, label: "Top level" }, ...parents.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </Field>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            Add
          </Button>
        </form>
        <div className="grid gap-6 sm:grid-cols-2">
          {(["expense", "income"] as const).map((k) => (
            <div key={k} className="space-y-2">
              <div className="text-sm font-medium">{k === "expense" ? "Expenses" : "Income"}</div>
              <ul className="divide-y rounded-md border">
                {all
                  .filter((c) => c.kind === k)
                  .sort((a, b) => categoryPath(a, all).localeCompare(categoryPath(b, all)))
                  .map((c) => (
                    <CategoryRow key={c.id} category={c} all={all} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryRow({ category, all }: { category: CategoryResponse; all: CategoryResponse[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const update = useMoneyMutation((input: { name?: string; archived?: boolean }) => moneyApi.categories.update(category.id, input), {
    onSuccess: () => setEditing(false),
  });
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ name: name.trim() });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus />
          <Button size="sm" type="submit">
            Save
          </Button>
        </form>
      ) : (
        <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => setEditing(true)}>
          <span className={category.archived ? "text-muted-foreground line-through" : undefined}>{categoryPath(category, all)}</span>
          {category.key ? <Badge variant="outline" className="ml-2">built in</Badge> : null}
        </button>
      )}
      {editing ? null : (
        <Button size="sm" variant="ghost" onClick={() => update.mutate({ archived: !category.archived })}>
          {category.archived ? "Restore" : "Archive"}
        </Button>
      )}
    </li>
  );
}
