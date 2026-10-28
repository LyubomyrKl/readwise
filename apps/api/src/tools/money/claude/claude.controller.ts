import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ClaudeBaseQuery, ClaudeNetWorthQuery, ClaudeRangeQuery, ClaudeTransactionsQuery, ProposeMovementDto } from './claude.models';
import { ClaudeService } from './claude.service';
import { MoneyTokenGuard, RequireScope, type TokenRequest } from './token.guard';

/**
 * Claude's read-only API, behind a money API token instead of a session:
 * the same answers the MCP server gives, as plain JSON. A draft token may also
 * propose movements; they wait for approval.
 */
@ApiTags('money: claude')
@ApiBearerAuth()
@UseGuards(MoneyTokenGuard)
@Controller('money/claude')
export class ClaudeController {
  constructor(private readonly claude: ClaudeService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Net worth, this month (income, expenses, invested, savings rate) and allocation' })
  summary(@Req() req: TokenRequest, @Query() q: ClaudeBaseQuery) {
    return this.claude.summary(req.moneyToken.userId, q.base);
  }

  @Get('net-worth')
  @ApiOperation({ summary: 'Net worth by account, currency and class' })
  netWorth(@Req() req: TokenRequest, @Query() q: ClaudeNetWorthQuery) {
    return this.claude.netWorth(req.moneyToken.userId, q);
  }

  @Get('month/:month')
  @ApiParam({ name: 'month', example: '2026-10' })
  @ApiOperation({ summary: 'One month with income and expenses by category' })
  month(@Req() req: TokenRequest, @Param('month') month: string, @Query() q: ClaudeBaseQuery) {
    return this.claude.month(req.moneyToken.userId, month, q.base);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Income, expenses, invested and savings rate per month' })
  monthly(@Req() req: TokenRequest, @Query() q: ClaudeRangeQuery) {
    return this.claude.monthly(req.moneyToken.userId, q);
  }

  @Get('allocation')
  @ApiOperation({ summary: 'Allocation against the targets' })
  allocation(@Req() req: TokenRequest, @Query() q: ClaudeBaseQuery) {
    return this.claude.allocation(req.moneyToken.userId, q.base);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Accounts with their balances' })
  accounts(@Req() req: TokenRequest) {
    return this.claude.accountList(req.moneyToken.userId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Income and expense categories' })
  categories(@Req() req: TokenRequest) {
    return this.claude.categoryList(req.moneyToken.userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Transactions, newest first' })
  transactions(@Req() req: TokenRequest, @Query() q: ClaudeTransactionsQuery) {
    return this.claude.transactionList(req.moneyToken.userId, q);
  }

  @Get('positions')
  @ApiOperation({ summary: 'Investment positions with cost and value' })
  positions(@Req() req: TokenRequest) {
    return this.claude.positionList(req.moneyToken.userId);
  }

  @Get('drafts')
  @ApiOperation({ summary: 'Movements waiting for approval' })
  drafts(@Req() req: TokenRequest) {
    return this.claude.draftList(req.moneyToken.userId);
  }

  @Post('drafts')
  @RequireScope('draft')
  @ApiOperation({ summary: 'Propose a movement (a draft token only); it posts when the user approves it' })
  propose(@Req() req: TokenRequest, @Body() dto: ProposeMovementDto) {
    return this.claude.propose(req.moneyToken, dto);
  }
}
