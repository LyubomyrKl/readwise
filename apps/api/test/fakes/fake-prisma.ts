/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { Book, Highlight, Job, Note, Prisma, RefreshToken, Summary, User } from '@prisma/client';

/**
 * An in-memory stand-in for the subset of the Prisma client the services use.
 * Supports where (equality, null, in, notIn, lt, lte, gt, gte, not, OR, AND),
 * orderBy (one key, object or array), take, include._count on books, and
 * Prisma.JsonNull in update data. Enough to exercise the job state machine and
 * the summaries flow without Postgres.
 */
type Row = Record<string, any>;

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${String(++seq).padStart(6, '0')}`;

// Strictly increasing timestamps so "newest first" is deterministic even within one millisecond.
let lastTick = 0;
function monotonicNow(): Date {
  lastTick = Math.max(Date.now(), lastTick + 1);
  return new Date(lastTick);
}

function valueMatches(actual: any, expected: any): boolean {
  if (expected === undefined) return true;
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
  if (typeof expected === 'object' && !Array.isArray(expected)) {
    return Object.entries(expected).every(([op, v]: [string, any]) => {
      switch (op) {
        case 'equals':
          return valueMatches(actual, v);
        case 'in':
          return (v as any[]).some((x) => valueMatches(actual, x));
        case 'notIn':
          return !(v as any[]).some((x) => valueMatches(actual, x));
        case 'not':
          return !valueMatches(actual, v);
        case 'lt':
          return actual != null && actual < v;
        case 'lte':
          return actual != null && actual <= v;
        case 'gt':
          return actual != null && actual > v;
        case 'gte':
          return actual != null && actual >= v;
        case 'contains':
          return typeof actual === 'string' && actual.includes(v);
        default:
          throw new Error(`FakePrisma: unsupported operator ${op}`);
      }
    });
  }
  return actual === expected;
}

export function rowMatches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Row[]).some((w) => rowMatches(row, w));
    if (key === 'AND') return (expected as Row[]).every((w) => rowMatches(row, w));
    if (key === 'NOT') return !rowMatches(row, expected as Row);
    return valueMatches(row[key], expected);
  });
}

function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, dir] = Object.entries(clause)[0] as [string, string];
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = av instanceof Date ? av.getTime() - bv.getTime() : av > bv ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

const clone = <T>(x: T): T => (x === null || x === undefined ? x : ({ ...(x as any) } as T));

export class FakeTable<T extends Row = Row> {
  rows: T[] = [];

  constructor(
    private readonly db: FakePrisma,
    private readonly name: string,
    private readonly defaults: () => Partial<T> = () => ({}),
  ) {}

  private present(row: T | undefined, args: Row | undefined): any {
    if (!row) return null;
    const out: Row = { ...row };
    if (args?.include?._count && this.name === 'book') {
      out._count = {
        notes: this.db.note.rows.filter((n) => n.bookId === (row as Row).id && n.deletedAt == null).length,
        highlights: this.db.highlight.rows.filter((h) => h.bookId === (row as Row).id && h.deletedAt == null).length,
      };
    }
    return out;
  }

  private applyData(row: T, data: Row): void {
    for (const [key, value] of Object.entries(data)) {
      (row as Row)[key] = value === Prisma.JsonNull || value === Prisma.DbNull ? null : value;
    }
    (row as Row).updatedAt = new Date();
  }

  async create(args: { data: Row }): Promise<T> {
    const now = monotonicNow();
    const row = {
      id: nextId(this.name),
      createdAt: now,
      updatedAt: now,
      ...this.defaults(),
    } as Row;
    this.applyData(row as T, args.data);
    this.rows.push(row as T);
    return clone(row as T);
  }

  async findUnique(args: { where: Row }): Promise<T | null> {
    return this.present(this.rows.find((r) => rowMatches(r, args.where)), args);
  }

  async findUniqueOrThrow(args: { where: Row }): Promise<T> {
    const row = await this.findUnique(args);
    if (!row) throw new Error(`FakePrisma: no ${this.name} for ${JSON.stringify(args.where)}`);
    return row;
  }

  async findFirst(args: { where?: Row; orderBy?: Row | Row[]; include?: Row } = {}): Promise<T | null> {
    const [first] = sortRows(this.rows.filter((r) => rowMatches(r, args.where)), args.orderBy);
    return this.present(first as T | undefined, args);
  }

  async findMany(args: { where?: Row; orderBy?: Row | Row[]; take?: number; include?: Row } = {}): Promise<T[]> {
    let rows = sortRows(this.rows.filter((r) => rowMatches(r, args.where)), args.orderBy);
    if (args.take !== undefined) rows = rows.slice(0, args.take);
    return rows.map((r) => this.present(r as T, args));
  }

  async count(args: { where?: Row } = {}): Promise<number> {
    return this.rows.filter((r) => rowMatches(r, args.where)).length;
  }

  async update(args: { where: Row; data: Row }): Promise<T> {
    const row = this.rows.find((r) => rowMatches(r, args.where));
    if (!row) throw new Error(`FakePrisma: cannot update missing ${this.name} ${JSON.stringify(args.where)}`);
    this.applyData(row, args.data);
    return clone(row);
  }

  async updateMany(args: { where: Row; data: Row }): Promise<{ count: number }> {
    const rows = this.rows.filter((r) => rowMatches(r, args.where));
    rows.forEach((r) => this.applyData(r, args.data));
    return { count: rows.length };
  }

  async delete(args: { where: Row }): Promise<T> {
    const idx = this.rows.findIndex((r) => rowMatches(r, args.where));
    if (idx < 0) throw new Error(`FakePrisma: cannot delete missing ${this.name}`);
    const [row] = this.rows.splice(idx, 1);
    return row;
  }

  async deleteMany(args: { where?: Row } = {}): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !rowMatches(r, args.where));
    return { count: before - this.rows.length };
  }
}

export class FakePrisma {
  readonly user = new FakeTable<User>(this, 'user');
  readonly refreshToken = new FakeTable<RefreshToken>(this, 'refreshToken');
  readonly job = new FakeTable<Job>(this, 'job', () => ({
    status: 'queued',
    progress: 0,
    attempts: 0,
    maxAttempts: 3,
    stage: null,
    waitReason: null,
    result: null,
    error: null,
    workerId: null,
    heartbeatAt: null,
    parentJobId: null,
    correlationId: null,
    subjectType: null,
    subjectId: null,
    startedAt: null,
    finishedAt: null,
  }));
  readonly summary = new FakeTable<Summary>(this, 'summary', () => ({ storageKey: null, jobId: null }));
  readonly book = new FakeTable<Book>(this, 'book', () => ({
    status: 'ready',
    errorMessage: null,
    extractionStorageKey: null,
    customCoverStorageKey: null,
    description: null,
    spentTime: 0,
    pageCount: 0,
    pagePassCount: 0,
    isFinished: false,
    isFavorite: false,
    sha256: null,
    readingPosition: null,
    lastAccessed: new Date('2026-01-01T00:00:00Z'),
  }));
  readonly note = new FakeTable<Note>(this, 'note', () => ({ deletedAt: null }));
  readonly highlight = new FakeTable<Highlight>(this, 'highlight', () => ({ deletedAt: null }));

  $queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);

  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

/** A queue double that records publishes and lets tests run consumer handlers directly. */
export class FakeQueue {
  published: Array<{ exchange: string; routingKey: string; message: any; options: any }> = [];
  consumers = new Map<string, (message: any) => Promise<'ack' | 'reject'>>();
  bindings: Array<{ queue: string; exchange: string; pattern: string }> = [];
  connected = true;

  publish = jest.fn(async (exchange: string, routingKey: string, message: any, options: any = {}) => {
    this.published.push({ exchange, routingKey, message, options });
  });

  consume = jest.fn(async (queue: string, handler: (message: any) => Promise<'ack' | 'reject'>) => {
    this.consumers.set(queue, handler);
  });

  bindQueue = jest.fn(async (queue: string, exchange: string, pattern: string) => {
    this.bindings.push({ queue, exchange, pattern });
  });

  isConnected = () => this.connected;

  publishedTo(exchange: string) {
    return this.published.filter((p) => p.exchange === exchange);
  }
}

/** ConfigService double: only get(key) is used by the services. */
export function fakeConfig(values: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    APP_MODE: 'all',
    JOBS_LEASE_SECONDS: 900,
    JOBS_SWEEP_INTERVAL_SECONDS: 60,
    JOBS_MAX_ATTEMPTS: 3,
    RABBITMQ_HOST: 'rabbit.test',
    RABBITMQ_PORT: '5672',
    RABBITMQ_USER: 'user',
    RABBITMQ_PASS: 'pass',
    S3_HOST: 'minio.test',
    S3_PORT: '9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_BOOK_BUCKET_NAME: 'books',
    S3_BOOK_COVER_BUCKET_NAME: 'covers',
    S3_SUMMARIES_BUCKET_NAME: 'summaries',
    S3_EXTRACTIONS_BUCKET_NAME: 'extractions',
    S3_CHECKPOINTS_BUCKET_NAME: 'checkpoints',
  };
  const all = { ...defaults, ...values };
  return { get: jest.fn((key: string) => all[key]) } as any;
}
