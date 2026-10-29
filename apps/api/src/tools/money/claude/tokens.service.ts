import { Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyApiToken } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '@platform/db/prisma.service';
import { AuditService } from '../ledger/audit.service';
import { CreateTokenDto, CreatedTokenResponse, TokenResponse, type TokenScope } from './claude.models';

export interface VerifiedToken {
  id: string;
  userId: string;
  scope: TokenScope;
  name: string;
}

const PREFIX = 'mny_';
const LAST_USED_EVERY_MS = 60_000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Claude's access: tokens the user creates, revokes, and sees in use. The token
 * itself is shown once; only its SHA-256 is stored.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateTokenDto, actor = 'user'): Promise<CreatedTokenResponse> {
    const token = `${PREFIX}${randomBytes(32).toString('base64url')}`;
    const row = await this.prisma.$transaction(async (db) => {
      const created = await db.moneyApiToken.create({
        data: { userId, name: dto.name.trim(), scope: dto.scope, tokenHash: hashToken(token), prefix: token.slice(0, PREFIX.length + 6) },
      });
      await this.audit.record(db, { userId, actor, action: 'token.create', subjectId: created.id, details: { name: created.name, scope: created.scope } });
      return created;
    });
    return { ...present(row), token };
  }

  async list(userId: string): Promise<TokenResponse[]> {
    const rows = await this.prisma.moneyApiToken.findMany({ where: { userId }, orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }] });
    return rows.map(present);
  }

  async revoke(userId: string, id: string): Promise<TokenResponse> {
    const row = await this.prisma.moneyApiToken.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('token not found');
    if (row.revokedAt) return present(row);
    const saved = await this.prisma.$transaction(async (db) => {
      const updated = await db.moneyApiToken.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.record(db, { userId, actor: 'user', action: 'token.revoke', subjectId: id, details: { name: row.name } });
      return updated;
    });
    return present(saved);
  }

  /** The token behind an Authorization header value, or null when unknown or revoked. */
  async verify(raw: string): Promise<VerifiedToken | null> {
    if (!raw.startsWith(PREFIX) || raw.length < 20) return null;
    const row = await this.prisma.moneyApiToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    if (!row || row.revokedAt) return null;
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await this.prisma.moneyApiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return { id: row.id, userId: row.userId, scope: row.scope, name: row.name };
  }
}

function present(row: MoneyApiToken): TokenResponse {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
