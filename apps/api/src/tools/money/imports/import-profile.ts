import type { MovementKind } from '../movements/movement.models';
import { mapMoneyManagerRows, type CategoryRef, type MoneyManagerMapping } from '../core/money-manager';

/** What an import row becomes: the movement as its endpoint accepts it, categories and assets by name. */
export interface ImportProposal {
  kind: MovementKind;
  input: Record<string, string>;
  category?: CategoryRef;
  /** broker imports: the asset by ticker, created on commit when the user has none */
  asset?: { ticker: string; currency: string; name?: string };
}

export interface ProfileRow {
  rowNumber: number;
  status: 'pending' | 'ready' | 'skipped' | 'error' | 'duplicate' | 'matched';
  message?: string;
  proposal?: ImportProposal;
  dedupeHash?: string;
  /** status matched: the transaction already in the ledger */
  matchTransactionId?: string;
}

export interface ProfileInput {
  rows: string[][];
  mapping?: MoneyManagerMapping;
  /** the account a statement belongs to */
  account?: { id: string; number: string | null; currencies: string[] };
  /** the user's accounts, to recognise transfers between them by account number */
  ownAccounts: { id: string; name: string; number: string | null }[];
}

export interface ImportProfile {
  id: string;
  label: string;
  /** a statement of one account (bank, broker) rather than a whole history */
  needsAccount: boolean;
  /** columns are mapped on the import screen */
  needsMapping: boolean;
  map(input: ProfileInput): ProfileRow[];
}

export const MONEY_MANAGER_PROFILE: ImportProfile = {
  id: 'money-manager',
  label: 'Money-manager export (any CSV, columns mapped by you)',
  needsAccount: false,
  needsMapping: true,
  map({ rows, mapping }) {
    if (!mapping) return [];
    return mapMoneyManagerRows(rows, mapping).map((r) => ({
      rowNumber: r.rowNumber,
      status: r.status,
      message: r.message,
      proposal: r.proposal,
      dedupeHash: r.dedupeHash,
    }));
  },
};
