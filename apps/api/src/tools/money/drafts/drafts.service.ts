import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '@platform/db/prisma.service';
import { WRITE_TX, type Db } from '../common/db';
import { toDate } from '../common/parse';
import { todayIn } from '../core/dates';
import { AuditService } from '../ledger/audit.service';
import { jsonInput, LedgerService } from '../ledger/ledger.service';
import { MovementDto } from '../movements/movement.models';
import { MovementsService } from '../movements/movements.service';
import { TransactionPage, TransactionResponse } from '../transactions/transaction.models';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Proposed movements waiting for approval: from recurring rules (when they do
 * not post on their own) and from Claude. A draft holds its movement as data
 * and has no entries; approving posts it through the normal path.
 */
@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly movements: MovementsService,
    private readonly transactions: TransactionsService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string): Promise<TransactionPage> {
    return this.transactions.list(userId, { limit: '500' }, 'draft');
  }

  /**
   * Checks the input as far as it goes (a recurring buy may leave the units for
   * the approval) and stores it. Fields present must be valid.
   */
  async create(
    userId: string,
    movement: MovementDto,
    opts: { actor: string; note?: string; recurringRuleId?: string; date?: Date },
  ): Promise<TransactionResponse> {
    await this.check(movement);
    await this.ledger.ensureSetup(userId);
    const { id } = await this.prisma.$transaction((db) => this.createIn(db, userId, movement, opts));
    return this.transactions.get(userId, id);
  }

  /** Throws a 400 listing what is wrong with the fields present. */
  async check(movement: MovementDto): Promise<void> {
    const handler = this.movements.handler(movement.kind);
    const instance = plainToInstance(handler.dto, movement.input);
    const errors = await validate(instance, { skipMissingProperties: true, whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})));
    }
  }

  /** Stores a checked draft inside the caller's database transaction. */
  async createIn(
    db: Db,
    userId: string,
    movement: MovementDto,
    opts: { actor: string; note?: string; recurringRuleId?: string; date?: Date },
  ): Promise<{ id: string }> {
    const rawDate = (movement.input as { date?: unknown }).date;
    const date = opts.date ?? (typeof rawDate === 'string' ? toDate(rawDate) : todayIn('UTC'));
    const note = opts.note ?? (typeof movement.input.note === 'string' ? movement.input.note : null);
    const draft = await db.moneyTransaction.create({
      data: {
        userId,
        date,
        kind: movement.kind,
        status: 'draft',
        note,
        draft: jsonInput({ kind: movement.kind, input: movement.input }),
        proposedBy: opts.actor,
        recurringRuleId: opts.recurringRuleId ?? null,
      },
    });
    await this.audit.record(db, { userId, actor: opts.actor, action: 'draft.create', subjectId: draft.id, details: { kind: movement.kind } });
    return { id: draft.id };
  }

  /** Posts the draft, as proposed or with the input the user corrected. */
  async approve(userId: string, id: string, input: Record<string, unknown> | undefined, actor = 'user'): Promise<TransactionResponse> {
    const draft = await this.prisma.moneyTransaction.findFirst({ where: { id, userId, status: 'draft' } });
    if (!draft) throw new NotFoundException('draft not found or already posted');
    const proposal = draft.draft as { kind: MovementDto['kind']; input: Record<string, unknown> } | null;
    if (!proposal) throw new BadRequestException('the draft carries no movement');
    const posted = await this.prisma.$transaction(
      (db) =>
        this.movements.post(
          userId,
          { kind: proposal.kind, input: input ?? proposal.input },
          { actor, db, draftId: id, recurringRuleId: draft.recurringRuleId ?? undefined },
        ),
      WRITE_TX,
    );
    return this.transactions.get(userId, posted.id);
  }

  async reject(userId: string, id: string, actor = 'user'): Promise<{ removed: true }> {
    const draft = await this.prisma.moneyTransaction.findFirst({ where: { id, userId, status: 'draft' } });
    if (!draft) throw new NotFoundException('draft not found or already posted');
    await this.prisma.$transaction(async (db) => {
      await db.moneyTransaction.delete({ where: { id } });
      await this.audit.record(db, { userId, actor, action: 'draft.reject', subjectId: id, details: { kind: draft.kind } });
    });
    return { removed: true };
  }

  /** The date a draft would post on; a convenience for the approval form. */
  dateOf(input: Record<string, unknown>): Date | null {
    return typeof input.date === 'string' ? toDate(input.date) : null;
  }
}
