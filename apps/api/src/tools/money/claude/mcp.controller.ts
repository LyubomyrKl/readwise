import { Controller, Delete, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Response } from 'express';
import { z } from 'zod';
import { PROPOSABLE_KINDS } from './claude.models';
import { ClaudeService } from './claude.service';
import { MoneyTokenGuard, type TokenRequest } from './token.guard';
import type { VerifiedToken } from './tokens.service';

const INSTRUCTIONS = `Read access to one person's money: accounts, movements, investments, and three views
(net worth, where the money went each month, allocation against target). Amounts are exact
decimal strings with their currency ("1234.50 PLN"); totals are in a base currency (the user's
setting unless you pass "base"), converted at stored exchange rates for display only. Months are
YYYY-MM, days YYYY-MM-DD. With a draft token, propose_movement records a proposal that posts
only after the user approves it in the app; nothing else changes data.`;

const BASE = z.string().regex(/^[A-Z]{3}$/).optional().describe('ISO currency code for the totals, e.g. EUR; default: the base currency in settings');
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const READ = { readOnlyHint: true, openWorldHint: false } as const;

/** One MCP server per request (stateless), with the tools the token's scope allows. */
export function buildMcpServer(claude: ClaudeService, token: VerifiedToken): McpServer {
  const server = new McpServer({ name: 'workbench-money', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  const userId = token.userId;

  server.registerTool(
    'get_summary',
    {
      title: 'Money summary',
      description:
        'The three answers at once: net worth now (owned, owed, by type), this month so far (income, expenses, money invested, amount saved, savings rate in percent, top expenses) and the allocation against target; plus how many drafts wait for approval. Start here.',
      inputSchema: { base: BASE },
      annotations: READ,
    },
    async ({ base }) => json(await claude.summary(userId, base)),
  );

  server.registerTool(
    'get_month',
    {
      title: 'One month',
      description: 'Income, expenses, money invested, amount saved and savings rate for one month, with income and expenses by category.',
      inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('YYYY-MM; default: this month'), base: BASE },
      annotations: READ,
    },
    async ({ month, base }) => json(await claude.month(userId, month, base)),
  );

  server.registerTool(
    'get_monthly',
    {
      title: 'Month by month',
      description: 'Income, expenses, money invested, amount saved and savings rate for each month of a range (default: the last 12 months).',
      inputSchema: {
        from: z.string().regex(/^(\d{4}-\d{2}|start)$/).optional().describe('first month YYYY-MM, or "start" for the first recorded month'),
        to: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('last month YYYY-MM; default: this month'),
        base: BASE,
      },
      annotations: READ,
    },
    async (args) => json(await claude.monthly(userId, args)),
  );

  server.registerTool(
    'get_net_worth',
    {
      title: 'Net worth',
      description: 'Net worth on a day (default today) by account (with each holding and how it is valued), by currency and by asset class.',
      inputSchema: { base: BASE, asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; default: today') },
      annotations: READ,
    },
    async (args) => json(await claude.netWorth(userId, args)),
  );

  server.registerTool(
    'get_allocation',
    {
      title: 'Allocation',
      description: 'What is owned per asset class against its target percent: drift in percentage points, and toTarget (positive: buy this much to reach the target; negative: this much above it).',
      inputSchema: { base: BASE },
      annotations: READ,
    },
    async ({ base }) => json(await claude.allocation(userId, base)),
  );

  server.registerTool(
    'list_accounts',
    { title: 'Accounts', description: 'Every account with its id, type and current balances.', annotations: READ },
    async () => json(await claude.accountList(userId)),
  );

  server.registerTool(
    'list_categories',
    { title: 'Categories', description: 'Income and expense categories with their ids.', annotations: READ },
    async () => json(await claude.categoryList(userId)),
  );

  server.registerTool(
    'list_transactions',
    {
      title: 'Transactions',
      description: 'Posted transactions, newest first, each with its legs on the accounts. Pass nextCursor back as "before" for the next page.',
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        q: z.string().max(100).optional().describe('words in the note'),
        limit: z.number().int().min(1).max(200).optional().describe('default 50'),
        before: z.string().optional().describe('the nextCursor of the previous page'),
      },
      annotations: READ,
    },
    async ({ limit, ...rest }) => json(await claude.transactionList(userId, { ...rest, limit: limit === undefined ? undefined : String(limit) })),
  );

  server.registerTool(
    'get_positions',
    { title: 'Investments', description: 'Investment positions: units, cost, market value, gain and how each is valued.', annotations: READ },
    async () => json(await claude.positionList(userId)),
  );

  server.registerTool(
    'list_drafts',
    { title: 'Drafts', description: 'Movements proposed (by recurring rules or by you) that wait for the user to approve them.', annotations: READ },
    async () => json(await claude.draftList(userId)),
  );

  if (token.scope === 'draft') {
    server.registerTool(
      'propose_movement',
      {
        title: 'Propose a movement',
        description: `Record a proposed movement as a draft. It is not posted: the user approves or rejects it in the app.
Kinds and their input (amounts as decimal strings, date YYYY-MM-DD, ids from list_accounts and list_categories):
- expense / income / fee: date, accountId, currency, amount, categoryId?, note?
- transfer: date, fromAccountId, fromCurrency, amountOut, toAccountId, toCurrency?, amountIn? (needed across currencies), fee?, note?
- buy: date, accountId, assetId, units, total (all-in cost), currency, paidFromAccountId?, note?
- sell: date, accountId, assetId, units, proceeds (after fees), currency, proceedsToAccountId?, note?
- investment_income: date, accountId, currency, amount (what arrived), withholding?, incomeType? (dividend|interest|other), assetId?, note?
Fields you leave out are filled in by the user on approval.`,
        inputSchema: {
          kind: z.enum(PROPOSABLE_KINDS as [string, ...string[]]),
          input: z.record(z.string(), z.unknown()).describe('the movement fields for its kind'),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async ({ kind, input }) => json(await claude.propose(token, { kind: kind as (typeof PROPOSABLE_KINDS)[number], input })),
    );
  }
  return server;
}

/**
 * The MCP server (Streamable HTTP, stateless, JSON responses) at
 * /api/money/claude/mcp, behind a money API token. Connect Claude with the URL
 * and the token as the bearer.
 */
@ApiTags('money: claude')
@ApiBearerAuth()
@UseGuards(MoneyTokenGuard)
@Controller('money/claude/mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly claude: ClaudeService) {}

  @Post()
  @ApiOperation({ summary: 'MCP endpoint (JSON-RPC over Streamable HTTP)' })
  async handle(@Req() req: TokenRequest, @Res() res: Response): Promise<void> {
    const server = buildMcpServer(this.claude, req.moneyToken);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(`MCP request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }

  @Get()
  @ApiExcludeEndpoint()
  get(@Res() res: Response): void {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this server is stateless; POST JSON-RPC requests.' }, id: null });
  }

  @Delete()
  @ApiExcludeEndpoint()
  remove(@Res() res: Response): void {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: there are no sessions to end.' }, id: null });
  }
}
