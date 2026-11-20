"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PLATFORM_ROUTES } from "@platform/routes";
import { moneyApi } from "../api";
import { AutomationCard, RatesCard } from "../components/AutomationCards";
import { ClaudeAccessCard } from "../components/ClaudeAccessCard";
import { categoryPath, CurrencySelect, Field, NONE, SimpleSelect } from "../components/Fields";
import { useCategories, useMoneyMutation, useMoneySettings } from "../queries";
import type { CategoryResponse } from "../types";
import { BackLink } from "@platform/ui/BackLink";

export default function MoneySettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <BackLink fallback={PLATFORM_ROUTES.settings.root} className="mb-4" />
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6" />
          Money
        </h1>
        <p className="mt-1 text-muted-foreground">Base currency, categories, Claude, and what runs on its own</p>
      </div>
      <GeneralCard />
      <CategoriesCard />
      <ClaudeAccessCard />
      <AutomationCard />
      <RatesCard />
    </div>
  );
}

function GeneralCard() {
  const { data: settings } = useMoneySettings();
  const save = useMoneyMutation(moneyApi.settings.update, { success: "Saved" });
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
        <CardDescription>
          Income and expense categories; nest one level. Archived ones keep their history; a merged one is gone, and its
          history counts under the one it went into. One left out of the totals (selling something you own) still shows
          under each month, but not in its income, expenses or savings rate.
        </CardDescription>
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
  const [merging, setMerging] = useState(false);
  const [name, setName] = useState(category.name);
  const update = useMoneyMutation(
    (input: { name?: string; archived?: boolean; leftOutOfTotals?: boolean }) => moneyApi.categories.update(category.id, input),
    { onSuccess: () => setEditing(false) }
  );
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
          {category.leftOutOfTotals ? (
            <Badge variant="outline" className="ml-2 font-normal text-muted-foreground">
              left out of totals
            </Badge>
          ) : null}
        </button>
      )}
      {editing ? null : (
        <div className="flex shrink-0 items-center">
          {category.key ? null : (
            <Button size="sm" variant="ghost" onClick={() => setMerging(true)}>
              Merge
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title={category.leftOutOfTotals ? "Count it in the month's income and expenses again" : "Leave it out of the month's income, expenses and savings rate"}
            onClick={() => update.mutate({ leftOutOfTotals: !category.leftOutOfTotals })}
          >
            {category.leftOutOfTotals ? "Count it" : "Leave out"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update.mutate({ archived: !category.archived })}>
            {category.archived ? "Restore" : "Archive"}
          </Button>
        </div>
      )}
      {merging ? <MergeCategoryDialog category={category} all={all} onClose={() => setMerging(false)} /> : null}
    </li>
  );
}

/**
 * Merging a duplicate away: it leaves the lists, and what was booked to it shows and counts under
 * the category picked here. Nothing posted changes (the API keeps the category, pointing there).
 */
function MergeCategoryDialog({ category, all, onClose }: { category: CategoryResponse; all: CategoryResponse[]; onClose: () => void }) {
  const [intoId, setIntoId] = useState("");
  const candidates = all
    .filter((c) => c.kind === category.kind && c.id !== category.id && c.parentId !== category.id && !c.archived)
    .sort((a, b) => categoryPath(a, all).localeCompare(categoryPath(b, all)));
  const merge = useMoneyMutation(() => moneyApi.categories.merge(category.id, intoId), {
    success: (into) => `${category.name} merged into ${into.name}`,
    onSuccess: onClose,
  });
  const children = all.filter((c) => c.parentId === category.id);
  return (
    <AlertDialog open onOpenChange={(open) => (open ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Merge {category.name} into another category</AlertDialogTitle>
          <AlertDialogDescription>
            {category.name} leaves your categories. Everything booked to it shows and counts under the one you pick, in the
            history and in the reports, and a movement given it later goes there too.
            {children.length > 0 ? ` Its subcategories move along.` : ""} Nothing posted changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field label="Merge into">
          <SimpleSelect
            value={intoId}
            onChange={setIntoId}
            placeholder="Pick a category"
            options={candidates.map((c) => ({ value: c.id, label: categoryPath(c, all) }))}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!intoId || merge.isPending}
            onClick={(e) => {
              e.preventDefault();
              merge.mutate(undefined);
            }}
          >
            Merge
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
