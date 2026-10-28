import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { TransactionResponse } from '../transactions/transaction.models';
import { TransactionsService } from '../transactions/transactions.service';
import { ExpenseDto, FeeDto, IncomeDto, MovementDto, OpeningBalanceDto, TransferDto } from './movement.models';
import { MovementsService } from './movements.service';

@ApiTags('money')
@Controller('money/movements')
export class MovementsController {
  constructor(
    private readonly movements: MovementsService,
    private readonly transactions: TransactionsService,
  ) {}

  private async posted(userId: string, kind: MovementDto['kind'], input: object): Promise<TransactionResponse> {
    const tx = await this.movements.post(userId, { kind, input: { ...input } }, { actor: 'user' });
    return this.transactions.get(userId, tx.id);
  }

  @Post('income')
  @ApiEndpoint({ summary: 'Record income', response: TransactionResponse })
  income(@Req() req: UserModel, @Body() dto: IncomeDto) {
    return this.posted(req.user.userId, 'income', dto);
  }

  @Post('expense')
  @ApiEndpoint({ summary: 'Record an expense', response: TransactionResponse })
  expense(@Req() req: UserModel, @Body() dto: ExpenseDto) {
    return this.posted(req.user.userId, 'expense', dto);
  }

  @Post('fee')
  @ApiEndpoint({ summary: 'Record a fee (an expense in the Fees category by default)', response: TransactionResponse })
  fee(@Req() req: UserModel, @Body() dto: FeeDto) {
    return this.posted(req.user.userId, 'fee', dto);
  }

  @Post('opening-balance')
  @ApiEndpoint({ summary: 'Record what an account held when tracking started', response: TransactionResponse })
  openingBalance(@Req() req: UserModel, @Body() dto: OpeningBalanceDto) {
    return this.posted(req.user.userId, 'opening_balance', dto);
  }

  @Post('transfer')
  @ApiEndpoint({
    summary: 'Transfer between two sub-accounts (same currency: one amount; across currencies: out, in and the fee)',
    response: TransactionResponse,
  })
  transfer(@Req() req: UserModel, @Body() dto: TransferDto) {
    return this.posted(req.user.userId, 'transfer', dto);
  }

  @Post()
  @ApiEndpoint({ summary: 'Post any movement given as { kind, input }', response: TransactionResponse })
  async any(@Req() req: UserModel, @Body() dto: MovementDto) {
    const tx = await this.movements.post(req.user.userId, dto, { actor: 'user' });
    return this.transactions.get(req.user.userId, tx.id);
  }

  @Post('correct/:id')
  @ApiParam({ name: 'id', description: 'the posted transaction to correct' })
  @ApiEndpoint({
    summary: 'Correct a posted transaction: reverse it and post the corrected movement, linked to the original',
    response: TransactionResponse,
  })
  async correct(@Req() req: UserModel, @Param('id') id: string, @Body() dto: MovementDto) {
    const tx = await this.movements.correct(req.user.userId, id, dto);
    return this.transactions.get(req.user.userId, tx.id);
  }
}
