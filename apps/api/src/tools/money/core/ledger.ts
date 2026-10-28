/**
 * Double entry (rule 2): a transaction is a set of lines on sub-accounts that
 * sums to zero per commodity. Every write path calls assertBalanced before it
 * touches the database; the database checks it again at commit.
 */

export interface LedgerLine {
  subAccountId: string;
  commodityId: string;
  /** set for a currency sub-account: minor units, positive = into the sub-account */
  amountMinor?: bigint;
  /** set for an asset sub-account: units scaled by 10^10 */
  quantity?: bigint;
}

export class UnbalancedTransactionError extends Error {
  constructor(
    message: string,
    readonly imbalances: ReadonlyMap<string, bigint> = new Map(),
  ) {
    super(message);
    this.name = 'UnbalancedTransactionError';
  }
}

/** Net amount per commodity (minor units or scaled quantity). */
export function netByCommodity(lines: readonly LedgerLine[]): Map<string, bigint> {
  const net = new Map<string, bigint>();
  for (const line of lines) {
    const value = line.amountMinor ?? line.quantity ?? 0n;
    net.set(line.commodityId, (net.get(line.commodityId) ?? 0n) + value);
  }
  return net;
}

export function assertBalanced(lines: readonly LedgerLine[]): void {
  if (lines.length < 2) {
    throw new UnbalancedTransactionError('a transaction needs at least two entries');
  }
  for (const line of lines) {
    const hasAmount = line.amountMinor !== undefined;
    const hasQuantity = line.quantity !== undefined;
    if (hasAmount === hasQuantity) {
      throw new UnbalancedTransactionError(
        `entry on ${line.subAccountId} must carry exactly one of amountMinor and quantity`,
      );
    }
    if ((line.amountMinor ?? line.quantity) === 0n) {
      throw new UnbalancedTransactionError(`entry on ${line.subAccountId} is zero`);
    }
  }
  const imbalances = new Map([...netByCommodity(lines)].filter(([, net]) => net !== 0n));
  if (imbalances.size > 0) {
    const detail = [...imbalances].map(([c, net]) => `${c} ${net}`).join(', ');
    throw new UnbalancedTransactionError(`entries do not sum to zero: ${detail}`, imbalances);
  }
}
