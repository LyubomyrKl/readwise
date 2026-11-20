import type { Movement, TransactionResponse } from "../types";
import { movementFromTransaction } from "./movement";

/**
 * Several movements at once, from the list: a category for all of them, or deleting them. Each
 * one is its own correction or reversal (rule 4), the same as on its own page.
 */

/** The kind of category a movement takes, when it takes one: an expense's (a fee's too) or income's. */
export function categoryKindOf(tx: TransactionResponse): "expense" | "income" | null {
  if (tx.kind === "expense" || tx.kind === "fee") return "expense";
  return tx.kind === "income" ? "income" : null;
}

/** The kind the picked movements share, when they all take the same kind of category. */
export function sharedCategoryKind(txs: TransactionResponse[]): "expense" | "income" | null {
  const kinds = new Set(txs.map(categoryKindOf));
  return kinds.size === 1 ? [...kinds][0] : null;
}

/** What still counts can be picked; a reversal or a reversed movement is history already. */
export function pickable(tx: TransactionResponse): boolean {
  return tx.status === "posted" && !tx.reversedBy && tx.kind !== "correction";
}

/** The movement again in another category, as its correction posts it; null when nothing would change. */
export function inCategory(tx: TransactionResponse, categoryId: string): Movement | null {
  const movement = categoryKindOf(tx) ? movementFromTransaction(tx) : undefined;
  if (!movement || movement.input.categoryId === categoryId) return null;
  return { kind: movement.kind, input: { ...movement.input, categoryId } };
}
