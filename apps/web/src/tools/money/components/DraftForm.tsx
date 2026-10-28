"use client";

import { moneyApi } from "../api";
import { useMoneyMutation } from "../queries";
import type { TransactionResponse } from "../types";
import { CASH_KINDS, MovementForm, type CashKind } from "./MovementForm";

/** The draft's proposal in the form of its kind; submitting approves it with the edited input. */
export function DraftForm({ draft, onDone }: { draft: TransactionResponse; onDone: () => void }) {
  const approve = useMoneyMutation((input: Record<string, unknown>) => moneyApi.drafts.approve(draft.id, input), {
    success: "Posted",
  });
  const proposal = draft.draft;
  if (!proposal) return <p className="text-sm text-muted-foreground">This draft carries no movement.</p>;
  const initial = { kind: proposal.kind, input: { ...proposal.input, date: proposal.input.date ?? draft.date } };
  if (CASH_KINDS.some((k) => k.value === proposal.kind)) {
    return (
      <MovementForm
        initial={initial}
        initialKind={proposal.kind as CashKind}
        lockKind
        submitLabel="Approve"
        onSubmit={(m) => approve.mutateAsync(m.input)}
        onDone={onDone}
      />
    );
  }
  return <p className="text-sm text-muted-foreground">Open this kind of draft from the investments page.</p>;
}
