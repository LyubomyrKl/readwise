import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { CurrenciesService } from './currencies.service';
import { CurrencyResponse } from './currency.models';

@ApiTags('money')
@Controller()
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get('money/currencies')
  @ApiEndpoint({ summary: 'Every supported currency with its minor-unit digits', response: [CurrencyResponse] })
  list(): Promise<CurrencyResponse[]> {
    return this.currencies.list();
  }
}
