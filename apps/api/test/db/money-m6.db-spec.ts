import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { TokensService } from '@tools/money/claude/tokens.service';
import { formatDate, monthKey } from '@tools/money/core/dates';
import { DraftsService } from '@tools/money/drafts/drafts.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { ViewsService } from '@tools/money/views/views.service';
import { moneyHarness } from './money-harness';

/**
 * M6 done-when: Claude answers "what's my savings rate this month" from live
 * data; a Claude draft posts only after approval. Over HTTP, through the MCP
 * server, with the tokens the user hands out.
 */
describe('M6 Claude access', () => {
  let app: TestingModule;
  let http: INestApplication;
  let base: string;
  let prisma: PrismaService;
  let userId: string;
  let bank: string;
  let readToken: { id: string; token: string };
  let draftToken: { id: string; token: string };
  let movements: MovementsService;
  let views: ViewsService;
  let day: string;
  const clients: Client[] = [];

  const mcp = async (token: string) => {
    const client = new Client({ name: 'm6-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/money/claude/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    clients.push(client);
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const [first] = result.content as { type: string; text: string }[];
    return JSON.parse(first.text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const balance = async () => (await app.get(AccountsService).get(userId, bank)).balances.find((b) => b.commodityId === 'PLN')?.balance?.value;

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('m6');
    movements = app.get(MovementsService);
    views = app.get(ViewsService);
    const accounts = app.get(AccountsService);
    const inst = await accounts.createInstitution(userId, { name: 'mBank', kind: 'bank' });
    // this month, whatever today is: the summary answers for the current month
    const today = views.today();
    day = `${monthKey(today)}-01`;
    bank = (await accounts.create(userId, { institutionId: inst.id, name: 'eKonto', type: 'bank', currencies: ['PLN'], openingBalances: [{ currency: 'PLN', amount: '1000.00', date: day }] })).id;
    await movements.post(userId, { kind: 'income', input: { date: day, accountId: bank, currency: 'PLN', amount: '10000.00', note: 'Salary' } }, { actor: 'user' });
    await movements.post(userId, { kind: 'expense', input: { date: day, accountId: bank, currency: 'PLN', amount: '2500.00', note: 'Rent' } }, { actor: 'user' });

    const tokens = app.get(TokensService);
    readToken = await tokens.create(userId, { name: 'Claude', scope: 'read' });
    draftToken = await tokens.create(userId, { name: 'Claude drafts', scope: 'draft' });

    http = app.createNestApplication();
    await http.listen(0, '127.0.0.1');
    const address = http.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const c of clients) await c.close().catch(() => undefined);
    await http.close();
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it("answers what the savings rate is this month, from live data", async () => {
    const claude = await mcp(readToken.token);
    const tools = (await claude.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['get_summary', 'get_month', 'get_monthly', 'list_transactions', 'get_allocation']));
    expect(tools).not.toContain('propose_movement');

    // 10 000 in, 2 500 out: 75% saved
    const summary = await call(claude, 'get_summary');
    expect(summary.thisMonth).toMatchObject({ month: monthKey(views.today()), income: '10000.00 PLN', expenses: '2500.00 PLN', savingsRatePercent: '75.0' });
    expect(summary.thisMonth.savingsRatePercent).toBe((await views.month(userId, monthKey(views.today()))).savingsRate);

    // live: a new expense changes the answer at once
    await movements.post(userId, { kind: 'expense', input: { date: day, accountId: bank, currency: 'PLN', amount: '500.00', note: 'Groceries' } }, { actor: 'user' });
    expect((await call(claude, 'get_month')).savingsRatePercent).toBe('70.0');
    const txs = await call(claude, 'list_transactions', { limit: 2 });
    expect(txs.items.map((t: { note: string; legs: { amount: string }[] }) => [t.note, t.legs[0].amount])).toEqual([
      ['Groceries', '-500.00 PLN'],
      ['Rent', '-2500.00 PLN'],
    ]);
  });

  it('turns away requests without a live token', async () => {
    const post = (headers: Record<string, string>) =>
      fetch(`${base}/money/claude/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: 'Bearer mny_not-a-real-token-at-all' })).status).toBe(401);
    const revoked = await app.get(TokensService).create(userId, { name: 'old', scope: 'read' });
    await app.get(TokensService).revoke(userId, revoked.id);
    expect((await post({ authorization: `Bearer ${revoked.token}` })).status).toBe(401);
    // the REST twin answers too, and only to a token
    const rest = await fetch(`${base}/money/claude/summary`, { headers: { authorization: `Bearer ${readToken.token}` } });
    expect(rest.status).toBe(200);
    expect(((await rest.json()) as { thisMonth: { savingsRatePercent: string } }).thisMonth.savingsRatePercent).toBe('70.0');
    expect((await fetch(`${base}/money/claude/summary`)).status).toBe(401);
  });

  it('posts a draft from Claude only after approval', async () => {
    // 1 000 opening + 10 000 - 2 500 - 500
    expect(await balance()).toBe('8000.00');
    // a read token cannot propose
    const refused = await fetch(`${base}/money/claude/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${readToken.token}` },
      body: JSON.stringify({ kind: 'expense', input: { date: day, accountId: bank, currency: 'PLN', amount: '1.00' } }),
    });
    expect(refused.status).toBe(403);

    const claude = await mcp(draftToken.token);
    expect((await claude.listTools()).tools.map((t) => t.name)).toContain('propose_movement');
    const proposed = await call(claude, 'propose_movement', { kind: 'expense', input: { date: day, accountId: bank, currency: 'PLN', amount: '120.00', note: 'Dinner' } });
    expect(proposed).toMatchObject({ status: 'draft' });

    // proposed, not posted: no entries, the balance as it was
    const draft = await prisma.moneyTransaction.findUniqueOrThrow({ where: { id: proposed.draftId }, include: { entries: true } });
    expect([draft.status, draft.entries.length, draft.proposedBy]).toEqual(['draft', 0, `token:${draftToken.id}`]);
    expect(await balance()).toBe('8000.00');
    expect((await call(claude, 'list_drafts')).map((d: { id: string }) => d.id)).toContain(proposed.draftId);

    // the user approves: now it posts
    const posted = await app.get(DraftsService).approve(userId, proposed.draftId, undefined);
    expect([posted.status, posted.date]).toEqual(['posted', formatDate(new Date(day))]);
    expect(await balance()).toBe('7880.00');
  });
});
