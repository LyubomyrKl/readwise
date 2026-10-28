import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiParam, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { toDate } from '../common/parse';
import { MovementsService } from '../movements/movements.service';
import { TransactionResponse } from '../transactions/transaction.models';
import { TransactionsService } from '../transactions/transactions.service';
import { AssetsService } from './assets.service';
import {
  AssetClassResponse,
  AssetResponse,
  BuyDto,
  ClassSharesDto,
  CreateAssetClassDto,
  CreateAssetDto,
  CreatePriceDto,
  InvestmentIncomeDto,
  LotResponse,
  LotsQuery,
  PositionResponse,
  PositionsQuery,
  PriceResponse,
  SellDto,
  SplitDto,
  TargetDto,
  UnitMoveDto,
  UpdateAssetClassDto,
  UpdateAssetDto,
} from './investment.models';
import { PositionsService } from './positions.service';
import { PricesService } from './prices.service';

class RemovedResponse {
  @ApiProperty({ example: true }) removed!: true;
}

@ApiTags('money')
@Controller('money')
export class InvestmentsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly prices: PricesService,
    private readonly positions: PositionsService,
    private readonly movements: MovementsService,
    private readonly transactions: TransactionsService,
  ) {}

  // ---- assets ------------------------------------------------------------------------------

  @Get('assets')
  @ApiQuery({ name: 'archived', required: false })
  @ApiEndpoint({ summary: 'Assets with their classes and latest price', response: [AssetResponse] })
  listAssets(@Req() req: UserModel, @Query('archived') archived?: string) {
    return this.assets.list(req.user.userId, archived === 'true');
  }

  @Post('assets')
  @ApiEndpoint({ summary: 'Create an asset (any instrument)', response: AssetResponse })
  createAsset(@Req() req: UserModel, @Body() dto: CreateAssetDto) {
    return this.assets.create(req.user.userId, dto);
  }

  @Patch('assets/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Change an asset', response: AssetResponse })
  updateAsset(@Req() req: UserModel, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(req.user.userId, id, dto);
  }

  @Put('assets/:id/classes')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'How an asset splits across asset classes', response: AssetResponse })
  setShares(@Req() req: UserModel, @Param('id') id: string, @Body() dto: ClassSharesDto) {
    return this.assets.setShares(req.user.userId, id, dto.classes);
  }

  // ---- classes -----------------------------------------------------------------------------

  @Get('asset-classes')
  @ApiEndpoint({ summary: 'Asset classes with their current target and its history', response: [AssetClassResponse] })
  listClasses(@Req() req: UserModel) {
    return this.assets.listClasses(req.user.userId);
  }

  @Post('asset-classes')
  @ApiEndpoint({ summary: 'Create an asset class', response: AssetClassResponse })
  createClass(@Req() req: UserModel, @Body() dto: CreateAssetClassDto) {
    return this.assets.createClass(req.user.userId, dto);
  }

  @Patch('asset-classes/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Rename or reorder an asset class', response: AssetClassResponse })
  updateClass(@Req() req: UserModel, @Param('id') id: string, @Body() dto: UpdateAssetClassDto) {
    return this.assets.updateClass(req.user.userId, id, dto);
  }

  @Put('asset-classes/:id/target')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Set the target percent from a day on (history kept)', response: AssetClassResponse })
  setTarget(@Req() req: UserModel, @Param('id') id: string, @Body() dto: TargetDto) {
    return this.assets.setTarget(req.user.userId, id, dto);
  }

  // ---- prices ------------------------------------------------------------------------------

  @Get('prices')
  @ApiQuery({ name: 'assetId' })
  @ApiEndpoint({ summary: 'Prices of an asset, newest first', response: [PriceResponse] })
  listPrices(@Req() req: UserModel, @Query('assetId') assetId: string) {
    return this.prices.list(req.user.userId, assetId);
  }

  @Post('prices')
  @ApiEndpoint({ summary: 'Record a price (manual; one per asset and day)', response: PriceResponse })
  recordPrice(@Req() req: UserModel, @Body() dto: CreatePriceDto) {
    return this.prices.record(req.user.userId, dto);
  }

  @Delete('prices/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Remove a price', response: RemovedResponse })
  removePrice(@Req() req: UserModel, @Param('id') id: string) {
    return this.prices.remove(req.user.userId, id);
  }

  // ---- positions and lots ---------------------------------------------------------------------

  @Get('positions')
  @ApiEndpoint({ summary: 'Units, cost, value and gain per account and asset', response: [PositionResponse] })
  listPositions(@Req() req: UserModel, @Query() query: PositionsQuery) {
    return this.positions.positions(req.user.userId, {
      accountId: query.accountId,
      asOf: query.asOf ? toDate(query.asOf, 'asOf') : undefined,
    });
  }

  @Get('lots')
  @ApiEndpoint({ summary: 'Lots with their cost and cost in PLN', response: [LotResponse] })
  listLots(@Req() req: UserModel, @Query() query: LotsQuery) {
    return this.positions.lotList(req.user.userId, query);
  }

  // ---- trades ------------------------------------------------------------------------------

  private async posted(userId: string, kind: 'buy' | 'sell' | 'investment_income' | 'unit_move' | 'split', input: object) {
    const tx = await this.movements.post(userId, { kind, input: { ...input } }, { actor: 'user' });
    return this.transactions.get(userId, tx.id);
  }

  @Post('movements/buy')
  @ApiEndpoint({ summary: 'Buy: units in at their all-in cost; opens a lot', response: TransactionResponse })
  buy(@Req() req: UserModel, @Body() dto: BuyDto) {
    return this.posted(req.user.userId, 'buy', dto);
  }

  @Post('movements/sell')
  @ApiEndpoint({ summary: 'Sell: takes units from lots (FIFO or average cost)', response: TransactionResponse })
  sell(@Req() req: UserModel, @Body() dto: SellDto) {
    return this.posted(req.user.userId, 'sell', dto);
  }

  @Post('movements/investment-income')
  @ApiEndpoint({ summary: 'A dividend or interest, with tax withheld', response: TransactionResponse })
  investmentIncome(@Req() req: UserModel, @Body() dto: InvestmentIncomeDto) {
    return this.posted(req.user.userId, 'investment_income', dto);
  }

  @Post('movements/unit-move')
  @ApiEndpoint({ summary: 'Move units (with their lots) to another account', response: TransactionResponse })
  unitMove(@Req() req: UserModel, @Body() dto: UnitMoveDto) {
    return this.posted(req.user.userId, 'unit_move', dto);
  }

  @Post('movements/split')
  @ApiEndpoint({ summary: 'A split: units change in every account, cost does not', response: TransactionResponse })
  split(@Req() req: UserModel, @Body() dto: SplitDto) {
    return this.posted(req.user.userId, 'split', dto);
  }
}
