"use client";

import { useState } from "react";
import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { moneyApi } from "../api";
import { accountLabel } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { RecurringForm } from "../components/RecurringForm";
import { KIND_LABELS } from "../lib/describe";
import { formatDate } from "../lib/format";
import { describeProposal } from "../lib/proposal";
import { describeRule } from "../lib/schedule";
import { useAccounts, useMoneyMutation, useRecurring } from "../queries";
import type { ImportProposal, RecurringRule } from "../types";

/** Movements that repeat: rent, salary, the monthly fund buy. */
export default function RecurringPage() {
  const { data: rules, isLoading } = useRecurring();
  const [editing, setEditing] = useState<RecurringRule | "new" | null>(null);
  const run = useMoneyMutation(() => moneyApi.recurring.run(), {
    success: (r) =>
      r.posted + r.drafted === 0
        ? "Nothing due today"
        : [r.posted ? `${r.posted} posted` : "", r.drafted ? `${r.drafted} ${r.drafted === 1 ? "draft" : "drafts"} to approve` : ""].filter(Boolean).join(", "),
  });

  return (
    <MoneyPage>
      <PageHeader
        icon={Repeat}
        title="Recurring"
        description="Movements that repeat. Every morning each one due becomes a draft to approve, or is posted when you said so."
        actions={
          <>
            <Button variant="outline" onClick={() => run.mutate(undefined)} disabled={run.isPending}>
              Run what is due
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="mr-1 h-4 w-4" /> New recurring
            </Button>
          </>
        }
      />

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (rules ?? []).length === 0 ? (
        <EmptyState title="Nothing repeats yet">Rent on the 10th, salary on the 1st, the index fund every month: add them once.</EmptyState>
      ) : (
        <div className="space-y-3">
          {(rules ?? []).map((r) => (
            <RuleCard key={r.id} rule={r} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "New recurring movement" : "Recurring movement"}</SheetTitle>
            <SheetDescription>When it repeats, and the movement without its date.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {editing ? <RecurringForm key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </MoneyPage>
  );
}

function RuleCard({ rule, onEdit }: { rule: RecurringRule; onEdit: () => void }) {
  const { data: accounts } = useAccounts();
  const nameOf = (id: string) => {
    const a = accounts?.find((x) => x.id === id);
    return a ? accountLabel(a) : "";
  };
  const d = describeProposal({ kind: rule.kind, input: { ...(rule.template as Record<string, string>), date: rule.nextRunAt } } as ImportProposal, nameOf);
  const pause = useMoneyMutation((paused: boolean) => moneyApi.recurring.update(rule.id, { paused }), { success: (r) => (r.paused ? "Paused" : "Resumed") });
  const remove = useMoneyMutation(() => moneyApi.recurring.remove(rule.id), { success: "Removed; what it posted stays" });
  const inactive = rule.paused || rule.finished;

  return (
    <Card className={cn(inactive && "opacity-70")}>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{rule.name}</span>
            <Badge variant="secondary">{KIND_LABELS[rule.kind]}</Badge>
            <Badge variant="outline">{rule.autoPost ? "Posts on the day" : "Draft to approve"}</Badge>
            {rule.paused ? <Badge variant="outline">Paused</Badge> : null}
            {rule.finished ? <Badge variant="outline">Ended</Badge> : null}
          </div>
          <div className="text-sm text-muted-foreground">{d.detail}</div>
          <div className="text-sm">
            {describeRule(rule.schedule, rule.startDate)}
            {rule.endDate ? <span className="text-muted-foreground"> until {formatDate(rule.endDate)}</span> : null}
          </div>
          {!inactive ? (
            <div className="text-xs text-muted-foreground">
              Next: {rule.upcoming.map(formatDate).join(", ")}
              {rule.runs ? ` · ran ${rule.runs} ${rule.runs === 1 ? "time" : "times"}` : ""}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className={cn("tabular-nums font-medium", d.negative && "text-destructive")}>{d.amount}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${rule.name}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            {rule.finished ? null : (
              <Button size="sm" variant="ghost" onClick={() => pause.mutate(!rule.paused)} aria-label={rule.paused ? `Resume ${rule.name}` : `Pause ${rule.name}`}>
                {rule.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${rule.name}`}
              onClick={() => {
                if (window.confirm(`Stop repeating "${rule.name}"? What it already posted stays.`)) remove.mutate(undefined);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
