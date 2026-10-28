import { Controller, Get, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { TaxReportResponse } from './tax.models';
import { TaxService } from './tax.service';

@ApiTags('money')
@Controller('money/tax')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get(':year')
  @ApiParam({ name: 'year', example: 2026 })
  @ApiEndpoint({ summary: 'The yearly investment tax report (PIT-38): sales against lot costs in PLN, foreign dividends', response: TaxReportResponse })
  report(@Req() req: UserModel, @Param('year', ParseIntPipe) year: number) {
    return this.tax.report(req.user.userId, year);
  }
}
