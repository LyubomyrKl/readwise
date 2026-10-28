import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { TokenScope } from './claude.models';
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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TokenRequest>();
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('a money API token is required: Authorization: Bearer mny_…');
    const token = await this.tokens.verify(match[1]);
    if (!token) throw new UnauthorizedException('unknown or revoked token');
    const needed = this.reflector.getAllAndOverride<TokenScope | undefined>(SCOPE_KEY, [context.getHandler(), context.getClass()]) ?? 'read';
    if (needed === 'draft' && token.scope !== 'draft') throw new ForbiddenException('this token reads only; a draft token may propose movements');
    req.moneyToken = token;
    return true;
  }
}
