import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { PrismaService } from '@platform/db/prisma.service';
import { AuditService } from '../ledger/audit.service';
import { hashToken, TokensService } from './tokens.service';

/** Where Claude (claude.ai, the apps and Claude Code through claude.ai) sends the code back. */
export const CLAUDE_REDIRECT_URIS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
const CODE_TTL_MS = 5 * 60_000;
const MCP_PATH = '/api/money/claude/mcp';

/** An OAuth error as RFC 6749 writes it: { error, error_description }. */
export class OAuthError extends BadRequestException {
  constructor(error: string, description: string) {
    super({ error, error_description: description });
  }
}

const sha256url = (value: string) => createHash('sha256').update(value).digest('base64url');

/**
 * OAuth 2.1 for Claude's custom connector, the only way Claude's cloud can
 * reach the MCP server. The public side (metadata, client registration, token)
 * is reachable from the internet; approving happens on the Workbench web page,
 * which only the owner's tailnet reaches. What Claude gets is an ordinary read
 * token ("Claude connector"), listed and revocable like the others. Codes are
 * single use, live five minutes, need the PKCE verifier and Claude's own
 * callback URL.
 */
@Injectable()
export class OAuthService {
  private readonly publicUrl: string | null;
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.publicUrl = config.get('MONEY_CLAUDE_PUBLIC_URL', { infer: true })?.replace(/\/$/, '') || null;
    this.webOrigin = (config.get('WEBAUTHN_ORIGIN', { infer: true }) ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  /** The MCP URL to give Claude, or null while no public address is configured. */
  info(): { mcpUrl: string | null } {
    return { mcpUrl: this.publicUrl ? `${this.publicUrl}${MCP_PATH}` : null };
  }

  private base(): string {
    if (!this.publicUrl) throw new NotFoundException('the Claude connector is not set up on this server (MONEY_CLAUDE_PUBLIC_URL)');
    return this.publicUrl;
  }

  /** The value of WWW-Authenticate on a 401 from the MCP server (RFC 9728). */
  challenge(): string | null {
    return this.publicUrl ? `Bearer resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource${MCP_PATH}"` : null;
  }

  protectedResource() {
    const base = this.base();
    return { resource: `${base}${MCP_PATH}`, authorization_servers: [base], bearer_methods_supported: ['header'], scopes_supported: ['read'] };
  }

  authorizationServer() {
    const base = this.base();
    return {
      issuer: base,
      // approving is a page of the web app, on the private address
      authorization_endpoint: `${this.webOrigin}/apps/money/connect`,
      token_endpoint: `${base}/api/money/oauth/token`,
      registration_endpoint: `${base}/api/money/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['read'],
    };
  }

  /** Dynamic client registration (RFC 7591), for Claude's callback only. Nothing is stored: the code carries the client id. */
  register(body: { redirect_uris?: unknown; client_name?: unknown }) {
    this.base();
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
    if (uris.length === 0 || uris.some((u) => !CLAUDE_REDIRECT_URIS.includes(u))) {
      throw new OAuthError('invalid_redirect_uri', `only Claude's callback is allowed: ${CLAUDE_REDIRECT_URIS.join(', ')}`);
    }
    return {
      client_id: `claude-${randomBytes(12).toString('base64url')}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : 'Claude',
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  /** The owner approved on the web page: a code for Claude, sent back through the browser. */
  async authorize(
    userId: string,
    p: { clientId: string; redirectUri: string; codeChallenge: string; codeChallengeMethod: string; state?: string; scope?: string },
  ): Promise<{ redirect: string }> {
    this.base();
    if (!CLAUDE_REDIRECT_URIS.includes(p.redirectUri)) throw new OAuthError('invalid_request', "the redirect is not Claude's callback");
    if (p.codeChallengeMethod !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(p.codeChallenge)) {
      throw new OAuthError('invalid_request', 'a PKCE S256 code challenge is required');
    }
    if (!p.clientId.trim() || p.clientId.length > 200) throw new OAuthError('invalid_request', 'client_id is missing');
    const code = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (db) => {
      await db.moneyOauthCode.create({
        data: {
          userId,
          codeHash: hashToken(code),
          clientId: p.clientId,
          redirectUri: p.redirectUri,
          codeChallenge: p.codeChallenge,
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      });
      await db.moneyOauthCode.deleteMany({ where: { userId, expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
      await this.audit.record(db, { userId, actor: 'user', action: 'oauth.approve', details: { clientId: p.clientId } });
    });
    const url = new URL(p.redirectUri);
    url.searchParams.set('code', code);
    if (p.state) url.searchParams.set('state', p.state);
    return { redirect: url.toString() };
  }

  /** The token endpoint: a code and its PKCE verifier, or a refresh token, for a read token that lives a day. */
  async token(body: Record<string, unknown>) {
    this.base();
    const field = (k: string): string => {
      const v = body[k];
      return typeof v === 'string' ? v : '';
    };
    if (field('grant_type') === 'refresh_token') {
      const renewed = await this.tokens.refreshConnector(field('refresh_token'), field('client_id') || undefined);
      if (!renewed) throw new OAuthError('invalid_grant', 'the refresh token is unknown, revoked or expired; connect again');
      return { ...renewed, token_type: 'Bearer', scope: 'read' };
    }
    if (field('grant_type') !== 'authorization_code') throw new OAuthError('unsupported_grant_type', 'authorization_code or refresh_token');
    const code = field('code');
    const verifier = field('code_verifier');
    if (!code || !verifier) throw new OAuthError('invalid_request', 'code and code_verifier are required');
    const row = await this.prisma.moneyOauthCode.findUnique({ where: { codeHash: hashToken(code) } });
    const invalid = () => new OAuthError('invalid_grant', 'the code is unknown, used, expired or does not match');
    if (!row || row.usedAt || row.expiresAt < new Date()) throw invalid();
    if (field('redirect_uri') && field('redirect_uri') !== row.redirectUri) throw invalid();
    if (field('client_id') && field('client_id') !== row.clientId) throw invalid();
    if (sha256url(verifier) !== row.codeChallenge) throw invalid();
    // single use, even when two requests race
    const claimed = await this.prisma.moneyOauthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw invalid();
    const grant = await this.tokens.createForConnector(row.userId, row.clientId);
    return { ...grant, token_type: 'Bearer', scope: 'read' };
  }
}
