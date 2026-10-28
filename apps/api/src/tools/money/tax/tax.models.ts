import { ApiProperty } from '@nestjs/swagger';
import { AmountJson } from '../common/amounts';

export class TaxLotLine {
  @ApiProperty() lotId!: string;
  @ApiProperty({ example: '2027-06-02' }) acquiredAt!: string;
  @ApiProperty({ example: '10' }) units!: string;
  @ApiProperty({ type: AmountJson, description: 'the share of the lot cost, as paid' }) cost!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'that share in PLN at the lot rate' }) costPln!: AmountJson | null;
  @ApiProperty({ nullable: true, example: '4.2611' }) rate!: string | null;
  @ApiProperty({ nullable: true, description: 'the NBP table of the business day before the buy' }) rateDate!: string | null;
}

export class TaxSale {
  @ApiProperty() transactionId!: string;
  @ApiProperty() date!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() assetCode!: string;
  @ApiProperty() assetName!: string;
  @ApiProperty() units!: string;
  @ApiProperty({ type: AmountJson, description: 'what arrived, fees deducted' }) proceeds!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true }) proceedsPln!: AmountJson | null;
  @ApiProperty({ nullable: true }) rate!: string | null;
  @ApiProperty({ nullable: true }) rateDate!: string | null;
  @ApiProperty({ type: AmountJson, nullable: true }) costPln!: AmountJson | null;
  @ApiProperty({ type: AmountJson, nullable: true }) gainPln!: AmountJson | null;
  @ApiProperty({ type: [TaxLotLine] }) lots!: TaxLotLine[];
}

export class TaxIncome {
  @ApiProperty() transactionId!: string;
  @ApiProperty() date!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty({ nullable: true }) assetCode!: string | null;
  @ApiProperty({ example: 'Dividends' }) category!: string;
  @ApiProperty({ type: AmountJson }) gross!: AmountJson;
  @ApiProperty({ type: AmountJson }) withheld!: AmountJson;
  @ApiProperty({ type: AmountJson, nullable: true }) grossPln!: AmountJson | null;
  @ApiProperty({ type: AmountJson, nullable: true }) withheldPln!: AmountJson | null;
  @ApiProperty({ nullable: true }) rate!: string | null;
  @ApiProperty({ nullable: true }) rateDate!: string | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: '19% of the gross' }) taxPln!: AmountJson | null;
  @ApiProperty({ type: AmountJson, nullable: true, description: 'the tax withheld that counts against it' }) creditPln!: AmountJson | null;
}

export class TaxTotals {
  @ApiProperty({ type: AmountJson, description: 'PIT-38 section C: revenue from sales' }) revenue!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'costs of the units sold' }) costs!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'revenue minus costs (a loss is negative)' }) income!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'the income rounded to whole złoty' }) base!: AmountJson;
  @ApiProperty({ type: AmountJson, description: '19% of the base, whole złoty' }) tax!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'section G: dividends and interest from abroad, gross' }) incomeGross!: AmountJson;
  @ApiProperty({ type: AmountJson }) incomeTax!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'tax paid abroad, up to the Polish tax' }) incomeCredit!: AmountJson;
  @ApiProperty({ type: AmountJson, description: 'left to pay, whole złoty' }) incomeDue!: AmountJson;
}

export class TaxReportResponse {
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ example: 'PLN' }) currency!: string;
  @ApiProperty({ description: 'the taxable investment accounts the report covers' }) accounts!: { id: string; name: string }[];
  @ApiProperty({ type: [TaxSale] }) sales!: TaxSale[];
  @ApiProperty({ type: [TaxIncome] }) income!: TaxIncome[];
  @ApiProperty({ type: TaxTotals }) totals!: TaxTotals;
  @ApiProperty({ description: 'false while a rate is missing; the totals leave those rows out' }) complete!: boolean;
  @ApiProperty({ type: [String] }) missing!: string[];
}
