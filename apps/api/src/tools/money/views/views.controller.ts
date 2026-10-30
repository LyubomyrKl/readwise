import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { toDate } from '../common/parse';
import { SnapshotsService } from './snapshots.service';
import {
  AllocationResponse,
  CreateSnapshotDto,
  HistoryResponse,
  HomeResponse,
  MonthDetail,
  PeriodDetail,
  MonthlyResponse,
  NetWorthResponse,
  RangeQuery,
  SnapshotResponse,
  ViewQuery,
} from './view.models';
import { ViewsService } from './views.service';

@ApiTags('money')
@Controller('money')
export class ViewsController {
  constructor(
    private readonly views: ViewsService,
    private readonly snapshots: SnapshotsService,
  ) {}

  @Get('views/home')
  @ApiQuery({ name: 'base', required: false })
  @ApiEndpoint({ summary: 'The three answers: net worth, this month, allocation', response: HomeResponse })
  home(@Req() req: UserModel, @Query('base') base?: string) {
    return this.views.home(req.user.userId, base);
  }

  @Get('views/net-worth')
  @ApiEndpoint({ summary: 'Net worth in a base currency, by account, currency, type and class', response: NetWorthResponse })
  netWorth(@Req() req: UserModel, @Query() q: ViewQuery) {
    return this.views.netWorth(req.user.userId, { base: q.base, asOf: q.asOf ? toDate(q.asOf, 'asOf') : undefined });
  }

  @Get('views/allocation')
  @ApiEndpoint({ summary: 'Allocation against the target, with the drift of each class', response: AllocationResponse })
  allocation(@Req() req: UserModel, @Query() q: ViewQuery) {
    return this.views.allocation(req.user.userId, { base: q.base, asOf: q.asOf ? toDate(q.asOf, 'asOf') : undefined });
  }

  @Get('views/monthly')
  @ApiEndpoint({ summary: 'Income, expenses, amount invested and savings rate per month', response: MonthlyResponse })
  monthly(@Req() req: UserModel, @Query() q: RangeQuery) {
    return this.views.monthly(req.user.userId, q);
  }

  @Get('views/month/:month')
  @ApiParam({ name: 'month', example: '2026-10' })
  @ApiQuery({ name: 'base', required: false })
  @ApiEndpoint({ summary: 'One month with income and expenses by category', response: MonthDetail })
  month(@Req() req: UserModel, @Param('month') month: string, @Query('base') base?: string) {
    return this.views.month(req.user.userId, month, base);
  }

  @Get('views/period')
  @ApiEndpoint({ summary: 'A whole range of months: income, expenses, invested and both by category', response: PeriodDetail })
  period(@Req() req: UserModel, @Query() q: RangeQuery) {
    return this.views.period(req.user.userId, q);
  }

  @Get('views/history')
  @ApiEndpoint({ summary: 'Net worth at each month end', response: HistoryResponse })
  history(@Req() req: UserModel, @Query() q: RangeQuery) {
    return this.views.history(req.user.userId, q);
  }

  @Get('snapshots')
  @ApiEndpoint({ summary: 'Quarterly snapshots, newest first', response: [SnapshotResponse] })
  listSnapshots(@Req() req: UserModel) {
    return this.snapshots.list(req.user.userId);
  }

  @Get('snapshots/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'One snapshot with what it froze', response: SnapshotResponse })
  getSnapshot(@Req() req: UserModel, @Param('id') id: string) {
    return this.snapshots.get(req.user.userId, id);
  }

  @Post('snapshots')
  @ApiEndpoint({ summary: 'Take a snapshot (one per day; again replaces it)', response: SnapshotResponse })
  takeSnapshot(@Req() req: UserModel, @Body() dto: CreateSnapshotDto) {
    return this.snapshots.take(req.user.userId, { date: dto.date ? toDate(dto.date) : undefined, label: dto.label });
  }
}
