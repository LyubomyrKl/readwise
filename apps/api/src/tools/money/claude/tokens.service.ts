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
const REFRESH_PREFIX = 'mnr_';
const LAST_USED_EVERY_MS = 60_000;
/** Claude's connector: an access token lives a day; its refresh token renews it for 30 days after the last renewal. */
export const CONNECTOR_ACCESS_TTL_S = 24 * 3600;
const CONNECTOR_REFRESH_TTL_MS = 30 * 24 * 3600_000;

export interface ConnectorGrant {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const secret = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;

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
    const token = secret(PREFIX);
    const row = await this.prisma.$transaction(async (db) => {
      const created = await db.moneyApiToken.create({
        data: { userId, name: dto.name.trim(), scope: dto.scope, tokenHash: hashToken(token), prefix: token.slice(0, PREFIX.length + 6) },
      });
      await this.audit.record(db, { userId, actor, action: 'token.create', subjectId: created.id, details: { name: created.name, scope: created.scope } });
      return created;
    });
    return { ...present(row), token };
  }

  /** A read token for Claude's connector, with the refresh token that renews it. One row per connection. */
  async createForConnector(userId: string, clientId: string): Promise<ConnectorGrant> {
    const access = secret(PREFIX);
    const refresh = secret(REFRESH_PREFIX);
    await this.prisma.$transaction(async (db) => {
      const created = await db.moneyApiToken.create({
        data: {
          userId,
          name: 'Claude connector',
          scope: 'read',
          tokenHash: hashToken(access),
          prefix: access.slice(0, PREFIX.length + 6),
          expiresAt: new Date(Date.now() + CONNECTOR_ACCESS_TTL_S * 1000),
          refreshTokenHash: hashToken(refresh),
          refreshExpiresAt: new Date(Date.now() + CONNECTOR_REFRESH_TTL_MS),
          oauthClientId: clientId,
        },
      });
      await this.audit.record(db, { userId, actor: 'claude-connector', action: 'token.create', subjectId: created.id, details: { name: created.name, scope: 'read', clientId } });
    });
    return { access_token: access, refresh_token: refresh, expires_in: CONNECTOR_ACCESS_TTL_S };
  }

  /**
   * Renews a connector token: a new access token and a new refresh token on the
   * same row (the old ones stop working at once). Null when the refresh token is
   * unknown, revoked, expired or was issued to another client.
   */
  async refreshConnector(rawRefresh: string, clientId?: string): Promise<ConnectorGrant | null> {
    if (!rawRefresh.startsWith(REFRESH_PREFIX)) return null;
    const row = await this.prisma.moneyApiToken.findUnique({ where: { refreshTokenHash: hashToken(rawRefresh) } });
    if (!row || row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt < new Date()) return null;
    if (clientId && row.oauthClientId && clientId !== row.oauthClientId) return null;
    const access = secret(PREFIX);
    const refresh = secret(REFRESH_PREFIX);
    // only the holder of the current refresh token renews, even when two requests race
    const renewed = await this.prisma.moneyApiToken.updateMany({
      where: { id: row.id, refreshTokenHash: row.refreshTokenHash, revokedAt: null },
      data: {
        tokenHash: hashToken(access),
        prefix: access.slice(0, PREFIX.length + 6),
        expiresAt: new Date(Date.now() + CONNECTOR_ACCESS_TTL_S * 1000),
        refreshTokenHash: hashToken(refresh),
        refreshExpiresAt: new Date(Date.now() + CONNECTOR_REFRESH_TTL_MS),
      },
    });
    if (renewed.count !== 1) return null;
    return { access_token: access, refresh_token: refresh, expires_in: CONNECTOR_ACCESS_TTL_S };
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

  /** The token behind an Authorization header value, or null when unknown, revoked or expired. `ip`: where the request came from. */
  async verify(raw: string, ip?: string): Promise<VerifiedToken | null> {
    if (!raw.startsWith(PREFIX) || raw.length < 20) return null;
    const row = await this.prisma.moneyApiToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) return null;
    const ipChanged = !!ip && ip !== row.lastUsedIp;
    if (ipChanged || !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await this.prisma.moneyApiToken
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), ...(ip ? { lastUsedIp: ip.slice(0, 64) } : {}) } })
        .catch(() => undefined);
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
    lastUsedIp: row.lastUsedIp,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    renewsUntil: row.refreshExpiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
