import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { MoneySettingsResponse, UpdateMoneySettingsDto } from './settings.models';
import { MoneySettingsService } from './settings.service';

@ApiTags('money')
@Controller('money/settings')
export class MoneySettingsController {
  constructor(private readonly settings: MoneySettingsService) {}

  @Get()
  @ApiEndpoint({ summary: 'Base currency, default cost-basis method, tax residence', response: MoneySettingsResponse })
  get(@Req() req: UserModel) {
    return this.settings.get(req.user.userId);
  }

  @Patch()
  @ApiEndpoint({ summary: 'Change the money settings (the base currency switches every total)', response: MoneySettingsResponse })
  update(@Req() req: UserModel, @Body() dto: UpdateMoneySettingsDto) {
    return this.settings.update(req.user.userId, dto);
  }
}
