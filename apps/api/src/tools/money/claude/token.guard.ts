import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { TokenScope } from './claude.models';
import { OAuthService } from './oauth.service';
import { TokensService, type VerifiedToken } from './tokens.service';

const SCOPE_KEY = 'money:token-scope';

/** The scope an endpoint needs; read by default. */
export const RequireScope = (scope: TokenScope) => SetMetadata(SCOPE_KEY, scope);

export type TokenRequest = Request & { moneyToken: VerifiedToken };

/** Lets in a request that carries a live money API token (Authorization: Bearer mny_…) with the scope the endpoint needs. */
@Injectable()
export class MoneyTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
    private readonly oauth: OAuthService,
  ) {}

  /** A 401 that tells an OAuth client (Claude's connector) where to sign in. */
  private unauthorized(context: ExecutionContext, message: string): UnauthorizedException {
    const challenge = this.oauth.challenge();
    if (challenge) context.switchToHttp().getResponse<Response>().setHeader('WWW-Authenticate', challenge);
    return new UnauthorizedException(message);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TokenRequest>();
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    if (!match) throw this.unauthorized(context, 'a money API token is required: Authorization: Bearer mny_…');
    const token = await this.tokens.verify(match[1], clientIp(req));
    if (!token) throw this.unauthorized(context, 'unknown or revoked token');
    const needed = this.reflector.getAllAndOverride<TokenScope | undefined>(SCOPE_KEY, [context.getHandler(), context.getClass()]) ?? 'read';
    if (needed === 'draft' && token.scope !== 'draft') throw new ForbiddenException('this token reads only; a draft token may propose movements');
    req.moneyToken = token;
    return true;
  }
}

/** The caller's address: Caddy sets X-Forwarded-For to the one client address it worked out. */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || undefined;
}
