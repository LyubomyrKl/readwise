import { ApiProperty } from '@nestjs/swagger';
import { formatMinor } from '../core/money';
import { formatQuantity } from '../core/quantity';

/** A currency amount on the wire: exact strings, never a float. */
export class AmountJson {
  @ApiProperty({ example: 'PLN' }) currency!: string;
  @ApiProperty({ example: '123456', description: 'integer, in minor units (grosz, cent)' }) minor!: string;
  @ApiProperty({ example: '1234.56', description: 'exact decimal, minor units / 10^decimals' }) value!: string;
}

export function amountJson(minor: bigint, currency: string, decimals: number): AmountJson {
  return { currency, minor: minor.toString(), value: formatMinor(minor, decimals) };
}

/** Units of an asset on the wire, e.g. "71.5". */
export function unitsJson(scaled: bigint): string {
  return formatQuantity(scaled);
}
