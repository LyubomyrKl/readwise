/** Mirrors apps/api/src/tools/money/reference/currency.models.ts */
export interface CurrencyResponse {
  code: string;
  name: string;
  /** minor-unit digits; amounts travel as integer strings of this unit */
  decimals: number;
}
