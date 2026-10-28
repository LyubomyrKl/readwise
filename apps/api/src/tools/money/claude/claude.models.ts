import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CURRENCY_PATTERN, DATE_PATTERN } from '../common/validation';
import { MOVEMENT_KINDS, type MovementKind } from '../movements/movement.models';

export const TOKEN_SCOPES = ['read', 'draft'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** What Claude may propose: every movement but the opening balance (that comes with an account or an import). */
export const PROPOSABLE_KINDS = MOVEMENT_KINDS.filter((k) => k !== 'opening_balance');

export class CreateTokenDto {
  @ApiProperty({ example: 'Claude' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiProperty({ enum: TOKEN_SCOPES, description: 'read: answers only; draft: may also propose movements, which wait for approval' })
  @IsIn(TOKEN_SCOPES)
  scope!: TokenScope;
}

export class TokenResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TOKEN_SCOPES }) scope!: string;
  @ApiProperty({ example: 'mny_Ab3dEf', description: 'the start of the token, to tell tokens apart' }) prefix!: string;
  @ApiProperty({ nullable: true }) lastUsedAt!: string | null;
  @ApiProperty({ nullable: true }) revokedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class CreatedTokenResponse extends TokenResponse {
  @ApiProperty({ description: 'shown once; only its hash is stored' }) token!: string;
}

export class ClaudeBaseQuery {
  @ApiProperty({ required: false, example: 'EUR', description: 'default: the base currency in settings' })
  @IsOptional()
  @Matches(CURRENCY_PATTERN)
  base?: string;
}

export class ClaudeNetWorthQuery extends ClaudeBaseQuery {
  @ApiProperty({ required: false, example: '2026-09-30', description: 'default: today' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  asOf?: string;
}

export class ClaudeRangeQuery extends ClaudeBaseQuery {
  @ApiProperty({ required: false, example: '2026-01' })
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}|start)$/)
  from?: string;

  @ApiProperty({ required: false, example: '2026-10' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  to?: string;
}

export class ClaudeTransactionsQuery {
  @ApiProperty({ required: false }) @IsOptional() @Matches(DATE_PATTERN) from?: string;
  @ApiProperty({ required: false }) @IsOptional() @Matches(DATE_PATTERN) to?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() accountId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() categoryId?: string;
  @ApiProperty({ required: false, description: 'words in the note' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiProperty({ required: false, example: '50' }) @IsOptional() @Matches(/^\d{1,3}$/) limit?: string;
  @ApiProperty({ required: false, description: 'the nextCursor of the previous page' }) @IsOptional() @IsString() before?: string;
}

export class ProposeMovementDto {
  @ApiProperty({ enum: PROPOSABLE_KINDS })
  @IsIn(PROPOSABLE_KINDS)
  kind!: Exclude<MovementKind, 'opening_balance'>;

  @ApiProperty({ description: 'the movement as its endpoint takes it; fields left out are filled in on approval' })
  @IsObject()
  input!: Record<string, unknown>;
}
