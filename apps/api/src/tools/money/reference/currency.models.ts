import { ApiProperty } from '@nestjs/swagger';

export class CurrencyResponse {
  @ApiProperty({ example: 'PLN', description: 'ISO 4217 code' })
  code: string;

  @ApiProperty({ example: 'Polish Zloty' })
  name: string;

  @ApiProperty({ example: 2, description: 'minor-unit digits; amounts travel as integers of this unit' })
  decimals: number;
}
