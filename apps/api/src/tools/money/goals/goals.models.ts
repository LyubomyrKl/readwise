import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AmountJson } from '../common/amounts';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN, CURRENCY_PATTERN } from '../common/validation';

export class GoalResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, example: 'Flat deposit' }) name!: string | null;
  @ApiProperty({ type: AmountJson, description: 'the net worth to reach, in its own currency' }) target!: AmountJson;
  @ApiProperty({ example: '2026-11-28T12:00:00.000Z' }) createdAt!: string;
}

export class CreateGoalDto {
  @ApiProperty({ required: false, example: 'Flat deposit' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiProperty({ example: '300000', description: 'the net worth to reach, above zero' })
  @Matches(AMOUNT_PATTERN, { message: `target must be ${AMOUNT_MESSAGE}` })
  target!: string;

  @ApiProperty({ example: 'PLN' })
  @Matches(CURRENCY_PATTERN)
  currency!: string;
}
