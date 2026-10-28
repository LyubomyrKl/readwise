import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { CommoditiesService } from './commodities.service';
import { CurrencyResponse } from './currency.models';

@ApiTags('money')
@Controller()
export class CurrenciesController {
  constructor(private readonly commodities: CommoditiesService) {}

  @Get('money/currencies')
  @ApiEndpoint({ summary: 'Every supported currency with its minor-unit digits', response: [CurrencyResponse] })
  list(): Promise<CurrencyResponse[]> {
    return this.commodities.list();
  }
}
