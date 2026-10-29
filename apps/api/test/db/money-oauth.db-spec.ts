import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { PrismaService } from '@platform/db/prisma.service';
import { OAuthService } from '@tools/money/claude/oauth.service';
import { TokensService } from '@tools/money/claude/tokens.service';
import { AuditService } from '@tools/money/ledger/audit.service';
import { moneyHarness } from './money-harness';

/**
 * Claude's custom connector: the owner approves, Claude trades the one-time
 * code and its PKCE verifier for a read token, and nothing else gets one.
 */
describe("Claude's connector (OAuth)", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let oauth: OAuthService;
  let tokens: TokensService;
  let userId: string;

  const PUBLIC = 'https://host.example.ts.net:8443';
  const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
  const verifier = 'v'.repeat(20) + 'erifier-of-the-pkce-flow-1234567890';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const approve = () => oauth.authorize(userId, { clientId: 'claude-abc', redirectUri: CALLBACK, codeChallenge: challenge, codeChallengeMethod: 'S256', state: 'xyz' });
  const codeOf = (redirect: string) => new URL(redirect).searchParams.get('code')!;
  const trade = (code: string, codeVerifier = verifier) =>
    oauth.token({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: CALLBACK, client_id: 'claude-abc' });

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('oauth');
    tokens = app.get(TokensService);
    const config = { get: (key: string) => ({ MONEY_CLAUDE_PUBLIC_URL: `${PUBLIC}/`, WEBAUTHN_ORIGIN: 'https://host.example.ts.net' })[key] };
    oauth = new OAuthService(prisma, tokens, app.get(AuditService), config as unknown as ConfigService);
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('is off until a public address is configured', () => {
    expect(app.get(OAuthService).info()).toEqual({ mcpUrl: null });
    expect(app.get(OAuthService).challenge()).toBeNull();
    expect(() => app.get(OAuthService).authorizationServer()).toThrow(/not set up/);
  });

  it('publishes metadata: approving on the private site, token and registration on the public one', () => {
    expect(oauth.info()).toEqual({ mcpUrl: `${PUBLIC}/api/money/claude/mcp` });
    expect(oauth.protectedResource()).toMatchObject({ resource: `${PUBLIC}/api/money/claude/mcp`, authorization_servers: [PUBLIC] });
    expect(oauth.authorizationServer()).toMatchObject({
      issuer: PUBLIC,
      authorization_endpoint: 'https://host.example.ts.net/apps/money/connect',
      token_endpoint: `${PUBLIC}/api/money/oauth/token`,
      registration_endpoint: `${PUBLIC}/api/money/oauth/register`,
      code_challenge_methods_supported: ['S256'],
    });
    expect(oauth.challenge()).toBe(`Bearer resource_metadata="${PUBLIC}/.well-known/oauth-protected-resource/api/money/claude/mcp"`);
  });

  it("registers clients only for Claude's callback", () => {
    expect(oauth.register({ redirect_uris: [CALLBACK], client_name: 'Claude' })).toMatchObject({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' });
    expect(() => oauth.register({ redirect_uris: ['https://evil.example/cb'] })).toThrow();
    expect(() => oauth.register({})).toThrow();
  });

  it('refuses to approve for another callback or without PKCE', async () => {
    await expect(oauth.authorize(userId, { clientId: 'c', redirectUri: 'https://evil.example/cb', codeChallenge: challenge, codeChallengeMethod: 'S256' })).rejects.toThrow();
    await expect(oauth.authorize(userId, { clientId: 'c', redirectUri: CALLBACK, codeChallenge: 'short', codeChallengeMethod: 'S256' })).rejects.toThrow();
    await expect(oauth.authorize(userId, { clientId: 'c', redirectUri: CALLBACK, codeChallenge: challenge, codeChallengeMethod: 'plain' })).rejects.toThrow();
  });

  it('trades an approved code once, with the right verifier, for a read token', async () => {
    const { redirect } = await approve();
    expect(redirect.startsWith(`${CALLBACK}?code=`)).toBe(true);
    expect(new URL(redirect).searchParams.get('state')).toBe('xyz');
    const code = codeOf(redirect);

    await expect(trade(code, 'a-wrong-verifier-that-is-long-enough-to-pass-length')).rejects.toThrow();
    const granted = await trade(code);
    expect(granted).toMatchObject({ token_type: 'Bearer', scope: 'read' });
    expect(await tokens.verify(granted.access_token)).toMatchObject({ userId, scope: 'read', name: 'Claude connector' });
    // the code is spent
    await expect(trade(code)).rejects.toThrow();
  });

  it('refuses an expired code, and a code for another callback', async () => {
    const code = codeOf((await approve()).redirect);
    await prisma.moneyOauthCode.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(trade(code)).rejects.toThrow();
    const other = codeOf((await approve()).redirect);
    await expect(oauth.token({ grant_type: 'authorization_code', code: other, code_verifier: verifier, redirect_uri: 'https://claude.com/api/mcp/auth_callback' })).rejects.toThrow();
    await expect(oauth.token({ grant_type: 'client_credentials' })).rejects.toThrow();
  });
});
