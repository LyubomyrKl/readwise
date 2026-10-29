import type { MovementKind } from '../movements/movement.models';
import { mapBankStatement, MBANK, PKO, ZEN, type BankPreset } from '../core/bank-statements';
import { mapIbkrStatement } from '../core/ibkr';
import { mapMoneyManagerRows, type CategoryRef, type MoneyManagerMapping } from '../core/money-manager';

/** What an import row becomes: the movement as its endpoint accepts it, categories and assets by name. */
export interface ImportProposal {
  kind: MovementKind;
  input: Record<string, string>;
  category?: CategoryRef;
  /** broker imports: the asset by ticker or ISIN, created on commit when the user has none */
  asset?: { ticker: string; currency: string; name?: string; isin?: string };
  /** never posted from the import (half of a transfer): only shown as matched when the ledger has it */
  matchOnly?: boolean;
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
  account?: { id: string; currencies: string[] };
  /** the numbered currencies of the user's accounts (account id and number), to recognise transfers between them */
  ownAccounts: { id: string; number: string | null }[];
  /** decimal places of a supported currency */
  decimalsOf: (currency: string) => number | undefined;
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

function bankProfile(preset: BankPreset): ImportProfile {
  return {
    id: preset.id,
    label: preset.label,
    needsAccount: true,
    needsMapping: false,
    map({ rows, account, ownAccounts }) {
      if (!account) return [];
      return mapBankStatement(preset, { rows, account: { id: account.id, currencies: account.currencies }, ownAccounts });
    },
  };
}

export const MBANK_PROFILE = bankProfile(MBANK);
export const PKO_PROFILE = bankProfile(PKO);
export const ZEN_PROFILE = bankProfile(ZEN);

export const IBKR_PROFILE: ImportProfile = {
  id: 'ibkr',
  label: 'Interactive Brokers activity statement (CSV)',
  needsAccount: true,
  needsMapping: false,
  map({ rows, account, decimalsOf }) {
    if (!account) return [];
    return mapIbkrStatement({ rows, accountId: account.id, decimalsOf });
  },
};
