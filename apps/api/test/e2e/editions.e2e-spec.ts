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
 * HTTP-level walk through an abridged edition: request it, feed the worker's events through the
 * consumer, find the edition in the library. Postgres, RabbitMQ and MinIO are replaced by doubles.
 */
describe('Abridged editions (e2e, infrastructure mocked)', () => {
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
      data: {
        id: 'book-1', userId: 'user-1', title: 'Хмельниччина', author: 'Автор', mime: 'application/epub+zip',
        sizeBytes: BigInt(10), fileStorageKey: 'user-1-1-h.epub',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const workerEvent = async (body: Record<string, unknown>) => {
    const handler = queue.consumers.get('q.api.job-events')!;
    return handler({ body: { v: 1, at: new Date().toISOString(), workerId: 'workers-1', ...body }, routingKey: `job.${String(body.event)}`, raw: {} });
  };

  let editionId: string;
  let jobId: string;

  it('POST /api/reader/documents/:id/editions queues reader.abridge with the settings and the file', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/reader/documents/book-1/editions')
      .send({ length: 'long', figures: 'all' })
      .expect(201);
    expect(res.body).toMatchObject({ existing: false, editionBookId: null });
    editionId = res.body.editionId;
    jobId = res.body.jobId;

    const [published] = queue.publishedTo(EXCHANGES.jobs);
    expect(published.routingKey).toBe('jobs.reader.abridge');
    expect(published.message).toMatchObject({
      jobId,
      toolId: 'reader',
      payload: { bookId: 'book-1', editionId, fileStorageKey: 'user-1-1-h.epub', mime: 'application/epub+zip', length: 'long', figures: 'all' },
    });
  });

  it('asking again for the same edition while it is made returns it; bad settings are refused', async () => {
    const again = await request(app.getHttpServer()).post('/api/reader/documents/book-1/editions').send({ length: 'long', figures: 'all' }).expect(201);
    expect(again.body).toMatchObject({ editionId, jobId, existing: true });
    expect(queue.publishedTo(EXCHANGES.jobs)).toHaveLength(1);

    await request(app.getHttpServer()).post('/api/reader/documents/book-1/editions').send({ length: 'huge' }).expect(400);
    await request(app.getHttpServer()).post('/api/reader/documents/nope/editions').send({}).expect(404);
  });

  it('GET /api/reader/editions/:id/progress lists the chapters from the worker manifest', async () => {
    storage.getJson.mockRejectedValueOnce(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    const before = await request(app.getHttpServer()).get(`/api/reader/editions/${editionId}/progress`).expect(200);
    expect(before.body).toMatchObject({ editionId, state: 'queued', chapters: [], totalWords: 0, writtenWords: 0 });

    storage.getJson.mockResolvedValueOnce({
      units: [
        { id: 'u1', title: 'Частина перша', level: 1, kind: 'divider', words: 3 },
        { id: 'u2', title: 'Розділ 1', level: 2, kind: 'chapter', words: 4000 },
        { id: 'u3', title: 'Розділ 2', level: 2, kind: 'chapter', words: 6000 },
      ],
      state: { u2: 'checked' },
      overview: '',
      settings: { factcheck: 'dense' },
    });
    const res = await request(app.getHttpServer()).get(`/api/reader/editions/${editionId}/progress`).expect(200);

    expect(storage.getJson).toHaveBeenLastCalledWith('checkpoints', `edition/${editionId}/manifest.json`);
    expect(res.body.chapters).toEqual([
      { id: 'u1', title: 'Частина перша', level: 1, divider: true, words: 3, state: 'pending' },
      { id: 'u2', title: 'Розділ 1', level: 2, divider: false, words: 4000, state: 'checked' },
      { id: 'u3', title: 'Розділ 2', level: 2, divider: false, words: 6000, state: 'pending' },
    ]);
    expect(res.body).toMatchObject({ totalWords: 10000, writtenWords: 4000, overview: false, factcheck: 'dense' });
    await request(app.getHttpServer()).get('/api/reader/editions/nope/progress').expect(404);
  });

  it('progress shows on the edition; success adds the EPUB to the library and records the structure', async () => {
    await workerEvent({ jobId, event: 'started', attempt: 1 });
    await workerEvent({ jobId, event: 'progress', stage: 'chapter 3 of 12: part 2 of 4', progress: 30 });
    let edition = await request(app.getHttpServer()).get(`/api/reader/editions/${editionId}`).expect(200);
    expect(edition.body).toMatchObject({ state: 'running', job: { stage: 'chapter 3 of 12: part 2 of 4', progress: 30 } });

    await workerEvent({
      jobId,
      event: 'succeeded',
      result: {
        storageKey: 'user-1-edition-x.epub', bytes: 54321, sha256: 'f00', title: 'Хмельниччина (скорочене видання)',
        language: 'uk', ratio: 0.31, chapters: 12, irStorageKey: 'ir/abc/ir-v1.json.gz', metrics: { seconds: 900 },
      },
    });

    edition = await request(app.getHttpServer()).get(`/api/reader/editions/${editionId}`).expect(200);
    expect(edition.body).toMatchObject({ state: 'ready', length: 'long', figures: 'all', result: { ratio: 0.31, chapters: 12 } });
    const editionBookId = edition.body.editionBookId as string;
    const book = await request(app.getHttpServer()).get(`/api/reader/documents/${editionBookId}`).expect(200);
    expect(book.body).toMatchObject({
      title: 'Хмельниччина (скорочене видання)', author: 'Автор', mime: 'application/epub+zip', sizeBytes: '54321',
      language: 'uk', fileUrl: `/reader/documents/${editionBookId}/download`,
    });
    const source = await request(app.getHttpServer()).get('/api/reader/documents/book-1').expect(200);
    expect(source.body).toMatchObject({ hasStructure: true });

    const list = await request(app.getHttpServer()).get('/api/reader/documents/book-1/editions').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: editionId, state: 'ready', editionBookId });
  });

  it('a repeated success event does not add the book twice; an edition cannot be abridged again', async () => {
    await workerEvent({ jobId, event: 'succeeded', result: { storageKey: 'user-1-edition-x.epub', bytes: 1 } });
    expect(await prisma.book.count({ where: { userId: 'user-1' } })).toBe(2);

    const editionBook = (await prisma.edition.findUnique({ where: { id: editionId } }))!.editionBookId!;
    await request(app.getHttpServer()).post(`/api/reader/documents/${editionBook}/editions`).send({}).expect(400);
    const same = await request(app.getHttpServer()).post('/api/reader/documents/book-1/editions').send({ length: 'long', figures: 'all' }).expect(201);
    expect(same.body).toMatchObject({ editionId, existing: true, editionBookId: editionBook });
  });

  it('GET /api/reader/documents/:id/structure serves the structure the ingest stored', async () => {
    storage.getJson.mockResolvedValueOnce({ language: 'uk', sections: [{ title: 'Розділ 1', kind: 'chapter', words: 1200 }] });

    const res = await request(app.getHttpServer()).get('/api/reader/documents/book-1/structure').expect(200);

    expect(storage.getJson).toHaveBeenCalledWith('extractions', 'ir/abc/structure-v1.json');
    expect(res.body).toEqual({ bookId: 'book-1', structure: { language: 'uk', sections: [{ title: 'Розділ 1', kind: 'chapter', words: 1200 }] } });
  });

  it('deleting the book removes the edition working files and the structure no other book shares', async () => {
    storage.listKeys.mockImplementation(async (_bucket: string, prefix: string) => [`${prefix}x`]);

    await request(app.getHttpServer()).delete('/api/reader/documents/book-1').expect(200);

    expect(storage.deleteObjects).toHaveBeenCalledWith('checkpoints', [`edition/${editionId}/x`]);
    expect(storage.deleteObjects).toHaveBeenCalledWith('extractions', ['ir/abc/x']);
    expect(storage.deleteObjects).toHaveBeenCalledWith('checkpoints', ['ocr/abc/x']);
    // the edition stays in the library as a book of its own
    expect(await prisma.book.count({ where: { userId: 'user-1' } })).toBe(1);
  });
});
