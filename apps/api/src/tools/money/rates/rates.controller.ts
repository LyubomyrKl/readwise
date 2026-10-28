import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@platform/db/prisma.service';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { toDate } from '../common/parse';
import { formatDate } from '../core/dates';
import { RemovedResponse } from '../drafts/drafts.controller';
import { CommoditiesService } from '../reference/commodities.service';
import { CreateRateDto, RateQuery, RateResponse, RateSourceStatus } from './rate.models';

type RateRow = { id: string; date: Date; fromId: string; toId: string; rate: { toFixed(): string }; source: string };

const present = (r: RateRow): RateResponse => ({ id: r.id, date: formatDate(r.date), from: r.fromId, to: r.toId, rate: r.rate.toFixed(), source: r.source });

/**
 * The exchange rate table: what the daily feeds stored, and rates typed in by
 * hand for a currency or a day the feeds do not cover. A manual rate wins over
 * the feeds for display; tax always uses NBP.
 */
@ApiTags('money')
@Controller('money/rates')
export class RatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commodities: CommoditiesService,
  ) {}

  @Get()
  @ApiEndpoint({ summary: 'Stored exchange rates, newest first (200)', response: [RateResponse] })
  async list(@Query() q: RateQuery): Promise<RateResponse[]> {
    const rows = await this.prisma.moneyExchangeRate.findMany({
      where: { fromId: q.from, toId: q.to, source: q.source },
      orderBy: [{ date: 'desc' }, { fromId: 'asc' }, { toId: 'asc' }],
      take: 200,
    });
    return rows.map(present);
  }

  @Get('status')
  @ApiEndpoint({ summary: 'First and latest day stored per source', response: [RateSourceStatus] })
  async status(): Promise<RateSourceStatus[]> {
    const rows = await this.prisma.moneyExchangeRate.groupBy({ by: ['source'], _min: { date: true }, _max: { date: true }, _count: true });
    return (['ecb', 'nbp', 'manual'] as const).map((source) => {
      const r = rows.find((x) => x.source === source);
      return {
        source,
        first: r?._min.date ? formatDate(r._min.date) : null,
        latest: r?._max.date ? formatDate(r._max.date) : null,
        count: r?._count ?? 0,
      };
    });
  }

  @Post()
  @ApiEndpoint({ summary: 'Enter a rate by hand (replaces a manual rate of the same day and pair)', response: RateResponse })
  async create(@Body() dto: CreateRateDto): Promise<RateResponse> {
    const from = await this.commodities.currency(dto.from);
    const to = await this.commodities.currency(dto.to);
    if (from.id === to.id) throw new BadRequestException('a rate needs two different currencies');
    const rate = dto.rate.trim().replace(',', '.');
    if (!/[1-9]/.test(rate)) throw new BadRequestException('the rate must be above zero');
    const date = toDate(dto.date);
    const row = await this.prisma.moneyExchangeRate.upsert({
      where: { source_date_fromId_toId: { source: 'manual', date, fromId: from.id, toId: to.id } },
      create: { source: 'manual', date, fromId: from.id, toId: to.id, rate },
      update: { rate },
    });
    return present(row);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Remove a rate entered by hand', response: RemovedResponse })
  async remove(@Param('id') id: string): Promise<{ removed: true }> {
    const row = await this.prisma.moneyExchangeRate.findUnique({ where: { id } });
    if (!row || row.source !== 'manual') throw new NotFoundException('manual rate not found');
    await this.prisma.moneyExchangeRate.delete({ where: { id } });
    return { removed: true };
  }
}
