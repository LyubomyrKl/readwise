import { divRound } from './decimal';
import { allocate } from './money';
import { formatQuantity } from './quantity';

/**
 * Cost basis. A buy opens a lot (units and what they cost); a sale or a unit
 * move takes units out of lots, oldest first (FIFO, the Polish rule) or
 * proportionally from every open lot (average cost). Each take carries its
 * share of the lot's remaining cost, so a lot taken in full gives up exactly
 * its cost and no grosz is lost to rounding. Pure.
 */

export type CostBasisMethod = 'fifo' | 'average';

export interface OpenLot {
  id: string;
  /** YYYY-MM-DD */
  acquiredAt: string;
  /** tie-breaker for lots acquired on the same day */
  sequence?: number;
  units: bigint;
  remainingUnits: bigint;
  remainingCostMinor: bigint;
  costCurrency: string;
}

export interface Take {
  lotId: string;
  units: bigint;
  costMinor: bigint;
  costCurrency: string;
}

export class LotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LotError';
  }
}

/** The cost a take of `units` carries out of a lot with `remainingUnits` costing `remainingCost`. */
export function costShare(remainingCost: bigint, units: bigint, remainingUnits: bigint): bigint {
  if (units === remainingUnits) return remainingCost;
  return divRound(remainingCost * units, remainingUnits);
}

export function heldUnits(lots: readonly OpenLot[]): bigint {
  return lots.reduce((sum, l) => sum + l.remainingUnits, 0n);
}

export function consumeLots(lots: readonly OpenLot[], units: bigint, method: CostBasisMethod): Take[] {
  if (units <= 0n) throw new LotError('units must be more than zero');
  const open = lots.filter((l) => l.remainingUnits > 0n);
  const held = heldUnits(open);
  if (held < units) throw new LotError(`only ${formatQuantity(held)} units are held in lots`);

  if (method === 'fifo') {
    const ordered = [...open].sort(
      (a, b) => a.acquiredAt.localeCompare(b.acquiredAt) || (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id),
    );
    const takes: Take[] = [];
    let needed = units;
    for (const lot of ordered) {
      if (needed === 0n) break;
      const take = lot.remainingUnits < needed ? lot.remainingUnits : needed;
      takes.push({
        lotId: lot.id,
        units: take,
        costMinor: costShare(lot.remainingCostMinor, take, lot.remainingUnits),
        costCurrency: lot.costCurrency,
      });
      needed -= take;
    }
    return takes;
  }

  // average cost: every open lot gives up the same fraction of its units
  const shares = allocate(
    units,
    open.map((l) => l.remainingUnits),
  );
  return open
    .map((lot, i) => ({ lot, take: shares[i] }))
    .filter(({ take }) => take > 0n)
    .map(({ lot, take }) => ({
      lotId: lot.id,
      units: take,
      costMinor: costShare(lot.remainingCostMinor, take, lot.remainingUnits),
      costCurrency: lot.costCurrency,
    }));
}

/** A split changes units, never cost: from:to = 1:3 triples every lot's units. */
export function splitUnits(units: bigint, from: bigint, to: bigint): bigint {
  if (from <= 0n || to <= 0n) throw new LotError('a split ratio has two positive numbers');
  return divRound(units * to, from);
}
