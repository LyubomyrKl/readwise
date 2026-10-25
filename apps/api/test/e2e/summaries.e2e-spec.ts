import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ReaderModule } from '@tools/reader/reader.module';
import { JobsModule } from '@platform/jobs/jobs.module';
import { PrismaModule } from '@platform/db/prisma.module';
import { StorageModule } from '@platform/storage/storage.module';
import { PrismaService } from '@platform/db/prisma.service';
import { QueueService } from '@platform/queue/queue.service';
import { StorageService } from '@platform/storage/storage.service';
import { validate } from '@platform/config/env.validation';
import { EXCHANGES } from '@platform/queue/topology';
import { FakePrisma, FakeQueue } from '../fakes/fake-prisma';

/**
 * HTTP-level walk through a summary: request it, watch the jobs, feed worker
 * events through the consumer, read the result. Postgres is replaced by the
 * in-memory fake, RabbitMQ by a recording double, MinIO by a stub.
 */
describe('Summaries and jobs (e2e, infrastructure mocked)', () => {
  let app: INestApplication;
  const prisma = new FakePrisma();
  const queue = new FakeQueue();
  const storage = {
    getJson: jest.fn(),
    listKeys: jest.fn().mockResolvedValue([]),
    deleteObjects: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn(),
  };
  const user = { userId: 'user-1', email: 'user@example.com' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate }), PrismaModule, StorageModule, JobsModule, ReaderModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(QueueService)
      .useValue(queue)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user?: typeof user }>().user = user;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    await prisma.book.create({
      data: { id: 'book-1', userId: 'user-1', title: 'A Book', author: 'A', mime: 'application/pdf', sizeBytes: BigInt(10), fileStorageKey: 'user-1-1-a.pdf' },
    });
    await prisma.book.create({
      data: { id: 'book-2', userId: 'someone-else', title: 'Not yours', author: 'B', mime: 'application/pdf', sizeBytes: BigInt(10), fileStorageKey: 'x.pdf' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Replays a worker event through the registered events consumer. */
  const workerEvent = async (body: Record<string, unknown>) => {
    const handler = queue.consumers.get('q.api.job-events')!;
    return handler({ body: { v: 1, at: new Date().toISOString(), workerId: 'workers-1', ...body }, routingKey: `job.${String(body.event)}`, raw: {} });
  };

  let summaryId: string;
  let extractJobId: string;
  let summarizeJobId: string;

  it('POST /api/reader/documents/:id/summaries creates a summary with an extract job and a summarize child', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/reader/documents/book-1/summaries')
      .send({ summaryType: 'abstractive', summarizationStrategy: 'two_pass' })
      .expect(201);
    expect(res.body).toMatchObject({ existing: false, storageKey: null });
    summaryId = res.body.summaryId;
    summarizeJobId = res.body.jobId;
    extractJobId = res.body.extractJobId;

    const published = queue.publishedTo(EXCHANGES.jobs);
    expect(published).toHaveLength(1);
    expect(published[0].routingKey).toBe('jobs.reader.extract');
    expect((published[0].message as { jobId: string }).jobId).toBe(extractJobId);
    expect((published[0].message as { payload: Record<string, unknown> }).payload).toMatchObject({ bookId: 'book-1', fileStorageKey: 'user-1-1-a.pdf', mime: 'application/pdf' });
  });

  it('GET /api/jobs lists both jobs for the book, newest first; GET /api/jobs/:id shows one', async () => {
    const res = await request(app.getHttpServer()).get('/api/jobs?subjectType=book&subjectId=book-1').expect(200);
    expect(res.body.map((j: { type: string }) => j.type)).toEqual(['reader.summarize', 'reader.extract']);
    expect(res.body[0]).toMatchObject({ id: summarizeJobId, status: 'queued', parentJobId: extractJobId });

    await request(app.getHttpServer()).get(`/api/jobs/${extractJobId}`).expect(200).expect((r) => expect(r.body.status).toBe('queued'));
    await request(app.getHttpServer()).get('/api/jobs?limit=0').expect(400);
  });

  it('the book itself only knows its file state; the summary list carries the job', async () => {
    expect(await workerEvent({ jobId: extractJobId, event: 'started', attempt: 1 })).toBe('ack');
    const books = await request(app.getHttpServer()).get('/api/reader/documents').expect(200);
    expect(books.body).toHaveLength(1);
    expect(books.body[0]).toMatchObject({ id: 'book-1', status: 'ready', hasExtraction: false, noteCount: 0, highlightCount: 0, fileUrl: '/reader/documents/book-1/download' });
    expect(books.body[0]).not.toHaveProperty('summaryKey');

    const list = await request(app.getHttpServer()).get('/api/reader/documents/book-1/summaries').expect(200);
    expect(list.body[0]).toMatchObject({ id: summaryId, state: 'queued', job: { id: summarizeJobId, status: 'queued' } });
  });

  it('extract succeeded publishes the summarize job with the extraction key and marks the book extracted', async () => {
    await workerEvent({ jobId: extractJobId, event: 'succeeded', result: { extractionStorageKey: 'extraction/book-1_extraction.md' } });

    const published = queue.publishedTo(EXCHANGES.jobs);
    expect(published).toHaveLength(2);
    expect(published[1].routingKey).toBe('jobs.reader.summarize');
    expect(published[1].message).toMatchObject({ jobId: summarizeJobId, payload: { summaryId, extractionStorageKey: 'extraction/book-1_extraction.md' } });
    const book = await request(app.getHttpServer()).get('/api/reader/documents/book-1').expect(200);
    expect(book.body).toMatchObject({ hasExtraction: true });
  });

  it('waiting shows up with its reason on the job and on the summary', async () => {
    await workerEvent({ jobId: summarizeJobId, event: 'started', attempt: 1 });
    await workerEvent({ jobId: summarizeJobId, event: 'waiting', reason: 'LLM host unreachable: http://ollama:11434', stage: 'segmenting', progress: 3 });

    const job = await request(app.getHttpServer()).get(`/api/jobs/${summarizeJobId}`).expect(200);
    expect(job.body).toMatchObject({ status: 'waiting', waitReason: 'LLM host unreachable: http://ollama:11434', stage: 'segmenting', progress: 3 });
    const summary = await request(app.getHttpServer()).get(`/api/reader/summaries/${summaryId}`).expect(200);
    expect(summary.body).toMatchObject({ state: 'waiting', job: { status: 'waiting', waitReason: 'LLM host unreachable: http://ollama:11434' } });
  });

  it('succeeded stores the key: the summary is ready and its content is served', async () => {
    await workerEvent({ jobId: summarizeJobId, event: 'progress', stage: 'section 3/3', progress: 90 });
    await workerEvent({ jobId: summarizeJobId, event: 'succeeded', result: { storageKey: `summary/book-1/${summaryId}.json`, metadata: { summary_tokens: 10 } } });
    storage.getJson.mockResolvedValue({ sections: [{ id: 's1', title: 'One', level: 'chapter', content: 'Summary.' }] });

    const list = await request(app.getHttpServer()).get('/api/reader/documents/book-1/summaries').expect(200);
    expect(list.body[0]).toMatchObject({ id: summaryId, state: 'ready', storageKey: `summary/book-1/${summaryId}.json`, type: 'abstractive', strategy: 'two_pass', job: { status: 'succeeded' } });

    const content = await request(app.getHttpServer()).get(`/api/reader/summaries/${summaryId}/content`).expect(200);
    expect(content.body).toMatchObject({ id: summaryId, state: 'ready', summary: { sections: [{ id: 's1' }] } });
    expect(storage.getJson).toHaveBeenCalledWith('summaries', `summary/book-1/${summaryId}.json`);

    const latest = await request(app.getHttpServer()).get('/api/reader/summaries?latestPerBook=true').expect(200);
    expect(latest.body).toEqual([expect.objectContaining({ id: summaryId, bookId: 'book-1', state: 'ready' })]);
  });

  it('a second identical request returns the existing summary without new jobs', async () => {
    const before = queue.publishedTo(EXCHANGES.jobs).length;
    const res = await request(app.getHttpServer())
      .post('/api/reader/documents/book-1/summaries')
      .send({ summaryType: 'abstractive', summarizationStrategy: 'two_pass' })
      .expect(201);
    expect(res.body).toMatchObject({ summaryId, existing: true, storageKey: `summary/book-1/${summaryId}.json` });
    expect(queue.publishedTo(EXCHANGES.jobs)).toHaveLength(before);
  });

  it('a failed job surfaces on the summary; cancel and retry work through /api/jobs', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/reader/documents/book-1/summaries')
      .send({ summaryType: 'extractive', summarizationStrategy: 'basic' })
      .expect(201);
    const jobId = res.body.jobId as string;
    expect(res.body.extractJobId).toBeNull(); // the book is extracted already
    await workerEvent({ jobId, event: 'started', attempt: 1 });
    await workerEvent({ jobId, event: 'failed', error: 'model not found', retryable: false });

    const summary = await request(app.getHttpServer()).get(`/api/reader/summaries/${res.body.summaryId}`).expect(200);
    expect(summary.body).toMatchObject({ state: 'failed', job: { status: 'failed', error: 'model not found' } });
    const latest = await request(app.getHttpServer()).get('/api/reader/summaries?latestPerBook=true').expect(200);
    expect(latest.body[0]).toMatchObject({ bookId: 'book-1', state: 'failed' });

    const retried = await request(app.getHttpServer()).post(`/api/jobs/${jobId}/retry`).expect(201);
    expect(retried.body).toMatchObject({ id: jobId, status: 'queued', attempts: 0 });
    const cancelled = await request(app.getHttpServer()).post(`/api/jobs/${jobId}/cancel`).expect(201);
    expect(cancelled.body).toMatchObject({ id: jobId, status: 'cancelled' });
    expect(queue.publishedTo(EXCHANGES.control).at(-1)!.message).toEqual({ v: 1, jobId, action: 'cancel' });
  });

  it('validation and ownership', async () => {
    await request(app.getHttpServer()).post('/api/reader/documents/book-1/summaries').send({ summarizationStrategy: 'magic' }).expect(400);
    await request(app.getHttpServer()).post('/api/reader/documents/book-1/summaries').send({ extra: true }).expect(400);
    await request(app.getHttpServer()).post('/api/reader/documents/book-2/summaries').send({}).expect(404);
    await request(app.getHttpServer()).get('/api/reader/documents/book-2/summaries').expect(404);
    await request(app.getHttpServer()).get('/api/reader/summaries?latestPerBook=maybe').expect(400);
  });

  it('malformed worker events are dead-lettered', async () => {
    expect(await workerEvent({ jobId: summarizeJobId, event: 'finished' })).toBe('reject');
  });

  it('DELETE /api/reader/documents/:id cleans up summaries, checkpoints and jobs before the row', async () => {
    storage.listKeys.mockImplementation((bucket: string, prefix: string) => Promise.resolve([`${prefix}obj.json`]));
    await request(app.getHttpServer()).delete('/api/reader/documents/book-1').expect(200);

    expect(storage.deleteObjects).toHaveBeenCalledWith('summaries', expect.arrayContaining([`summary/book-1/${summaryId}.json`, 'summary/book-1/obj.json']));
    expect(storage.deleteObjects).toHaveBeenCalledWith('checkpoints', ['checkpoint/book-1_obj.json']);
    expect(storage.deleteObject).toHaveBeenCalledWith('books', 'user-1-1-a.pdf');
    expect(await prisma.book.count({ where: { id: 'book-1' } })).toBe(0);
    const active = await prisma.job.findMany({ where: { subjectId: 'book-1', status: { in: ['queued', 'running', 'waiting'] } } });
    expect(active).toEqual([]);
  });
});
