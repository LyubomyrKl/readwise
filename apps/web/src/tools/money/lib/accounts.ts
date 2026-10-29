import type { AccountResponse, AccountType, InstitutionResponse } from "../types";

/** The account types that can hold units of an asset (buy, sell, unit moves). */
export const UNIT_ACCOUNT_TYPES: readonly AccountType[] = ["investment", "bonds"];

export function holdsUnits(account: Pick<AccountResponse, "type">): boolean {
  return UNIT_ACCOUNT_TYPES.includes(account.type);
}

/**
 * The institutions worth offering for a new account: those with no accounts
 * yet, and those with at least one account not archived. `accounts` must
 * include the archived ones.
 */
export function pickableInstitutions(
  institutions: InstitutionResponse[],
  accounts: Pick<AccountResponse, "institution" | "archivedAt">[]
): InstitutionResponse[] {
  const total = new Map<string, number>();
  const active = new Map<string, number>();
  for (const a of accounts) {
    if (!a.institution) continue;
    total.set(a.institution.id, (total.get(a.institution.id) ?? 0) + 1);
    if (!a.archivedAt) active.set(a.institution.id, (active.get(a.institution.id) ?? 0) + 1);
  }
  return institutions.filter((i) => !total.get(i.id) || (active.get(i.id) ?? 0) > 0);
}

/** The heading for accounts in no group; always listed last. */
export const UNGROUPED = "Other";

/**
 * Accounts by group (an institution on the API), groups in the order their
 * first account comes; accounts in no group go under "Other", last.
 */
export function groupAccounts<T extends Pick<AccountResponse, "institution">>(accounts: T[]): [string, T[]][] {
  const groups = new Map<string, { name: string; list: T[] }>();
  const loose: T[] = [];
  for (const a of accounts) {
    if (!a.institution) {
      loose.push(a);
      continue;
    }
    const group = groups.get(a.institution.id) ?? { name: a.institution.name, list: [] };
    group.list.push(a);
    groups.set(a.institution.id, group);
  }
  const out: [string, T[]][] = [...groups.values()].map((g) => [g.name, g.list]);
  return loose.length > 0 ? [...out, [UNGROUPED, loose]] : out;
}

const SEPARATORS = /[\s\-–—·_/|,.:()]+$/;

/**
 * The name to suggest for two accounts merged into one: the words their names
 * start with ("mBank USD" + "mBank PLN" -> "mBank"), else the target's name.
 */
export function mergeNameGuess(sourceName: string, targetName: string): string {
  const a = sourceName.trim();
  const b = targetName.trim();
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  let prefix = b.slice(0, i);
  // cut back to a whole word unless both names go on with a separator or end here
  const ends = (s: string) => i === s.length || /[\s\-–—·_/|,.:()]/.test(s[i]);
  if (!(ends(a) && ends(b))) prefix = prefix.replace(/[^\s\-–—·_/|,.:()]*$/, "");
  prefix = prefix.replace(SEPARATORS, "").trim();
  return prefix.length >= 2 ? prefix : b;
}

export interface MergeCandidate<T> {
  account: T;
  /** why it cannot take the merge; null when it can */
  reason: string | null;
}

type MergeShape = Pick<AccountResponse, "id" | "name" | "type" | "archivedAt" | "balances">;

/**
 * Why `source` cannot merge into anything (units move first), or null. The API
 * refuses an account with any asset sub-account.
 */
export function mergeBlocker(source: Pick<AccountResponse, "name" | "balances">): string | null {
  return source.balances.some((b) => b.kind === "asset")
    ? `${source.name} holds units; move them to another account with a unit move first`
    : null;
}

/**
 * The accounts `source` could merge into: the same type, not itself, not archived;
 * those sharing a currency with it come with the reason and last.
 */
export function mergeCandidates<T extends MergeShape>(source: MergeShape, accounts: T[]): MergeCandidate<T>[] {
  const own = new Set(source.balances.map((b) => b.code));
  const out = accounts
    .filter((a) => a.id !== source.id && a.type === source.type && !a.archivedAt)
    .map((account) => {
      const shared = account.balances.filter((b) => own.has(b.code)).map((b) => b.code);
      return { account, reason: shared.length > 0 ? `Both hold ${shared.join(", ")}` : null };
    });
  return [...out.filter((c) => !c.reason), ...out.filter((c) => c.reason)];
}
