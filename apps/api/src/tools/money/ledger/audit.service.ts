import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Db } from '../common/db';

export interface AuditEntry {
  userId: string;
  /** "user", "token:<id>", "recurring:<id>", "import:<batchId>", "system" */
  actor: string;
  action: string;
  subjectId?: string | null;
  details?: Record<string, unknown>;
}

/** Every write leaves a row, written in the same database transaction as the write. */
@Injectable()
export class AuditService {
  async record(db: Db, entry: AuditEntry): Promise<void> {
    await db.moneyAuditLog.create({
      data: {
        userId: entry.userId,
        actor: entry.actor,
        action: entry.action,
        subjectId: entry.subjectId ?? null,
        details: entry.details === undefined ? undefined : (toJson(entry.details) as Prisma.InputJsonValue),
      },
    });
  }
}

/** BigInt and Date values as strings, so any detail can be stored as JSON. */
export function toJson(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}
