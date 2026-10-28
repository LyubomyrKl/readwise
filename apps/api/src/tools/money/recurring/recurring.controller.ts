import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { RemovedResponse } from '../drafts/drafts.controller';
import { CreateRecurringDto, RecurringResponse, RecurringRunResult, UpdateRecurringDto } from './recurring.models';
import { RecurringService } from './recurring.service';

@ApiTags('money')
@Controller('money/recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  @ApiEndpoint({ summary: 'Recurring movements, next to run first', response: [RecurringResponse] })
  list(@Req() req: UserModel) {
    return this.recurring.list(req.user.userId);
  }

  @Post()
  @ApiEndpoint({ summary: 'Repeat a movement on a schedule (a draft each time, or posted)', response: RecurringResponse })
  create(@Req() req: UserModel, @Body() dto: CreateRecurringDto) {
    return this.recurring.create(req.user.userId, dto);
  }

  @Post('run')
  @ApiEndpoint({ summary: 'Run what is due today now (the daily job does this at 06:00)', response: RecurringRunResult })
  run(@Req() req: UserModel) {
    return this.recurring.runDue(req.user.userId);
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'One recurring movement', response: RecurringResponse })
  get(@Req() req: UserModel, @Param('id') id: string) {
    return this.recurring.get(req.user.userId, id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Change, pause or resume a recurring movement', response: RecurringResponse })
  update(@Req() req: UserModel, @Param('id') id: string, @Body() dto: UpdateRecurringDto) {
    return this.recurring.update(req.user.userId, id, dto);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Stop repeating; what it posted stays', response: RemovedResponse })
  remove(@Req() req: UserModel, @Param('id') id: string) {
    return this.recurring.remove(req.user.userId, id);
  }
}
