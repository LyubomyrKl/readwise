import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { ReverseDto } from '../movements/movement.models';
import { ListTransactionsQuery, TransactionPage, TransactionResponse } from './transaction.models';
import { TransactionsService } from './transactions.service';

@ApiTags('money')
@Controller('money/transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiEndpoint({ summary: 'Posted transactions, newest first, with their entries', response: TransactionPage })
  list(@Req() req: UserModel, @Query() query: ListTransactionsQuery) {
    return this.transactions.list(req.user.userId, query);
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'One transaction with its entries', response: TransactionResponse })
  get(@Req() req: UserModel, @Param('id') id: string) {
    return this.transactions.get(req.user.userId, id);
  }

  @Post(':id/reverse')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Reverse a posted transaction (deleting means reversing)', response: TransactionResponse })
  reverse(@Req() req: UserModel, @Param('id') id: string, @Body() dto: ReverseDto) {
    return this.transactions.reverse(req.user.userId, id, dto);
  }
}
