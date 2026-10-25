import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { PrismaService } from '@platform/db/prisma.service';
import { QueueService } from '@platform/queue/queue.service';
import { StorageService } from '@platform/storage/storage.service';
import { FakePrisma, FakeQueue } from '../fakes/fake-prisma';

/**
 * Boots the whole AppModule with every piece of infrastructure replaced by a
 * double. Catches wiring mistakes (a provider without its dependencies, a tool
 * module not registered) without Postgres, RabbitMQ or MinIO. Environment
 * defaults for ConfigModule's validation come from test/setup-env.ts.
 */
describe('AppModule (boot, infrastructure mocked)', () => {
  let app: INestApplication;
  const queue = new FakeQueue();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(new FakePrisma())
      .overrideProvider(QueueService)
      .useValue(queue)
      .overrideProvider(StorageService)
      .useValue({ ping: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the liveness and readiness probes', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => expect(res.body).toMatchObject({ status: 'ok' }));

    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect((res) =>
        expect(res.body).toMatchObject({
          status: 'ok',
          checks: { database: { status: 'ok' }, storage: { status: 'ok' }, messageQueue: { status: 'ok' } },
        }),
      );
  });

  it('starts the job consumers in APP_MODE=all', () => {
    expect(queue.consume).toHaveBeenCalledWith('q.api.job-events', expect.any(Function), expect.anything());
  });

  it('protects platform and tool routes with the JWT guard, at new and compatibility paths', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/jobs').expect(401);
    await request(server).get('/api/books').expect(401);
    await request(server).get('/api/reader/documents').expect(401);
    await request(server).get('/api/reader/documents/book-1/summaries').expect(401);
    await request(server).get('/api/reader/documents/book-1/notes').expect(401);
    await request(server).get('/api/reader/documents/book-1/highlights').expect(401);
    await request(server).post('/api/summarizer/request').send({ bookId: 'book-1' }).expect(401);
  });

  it('does not expose removed APIs', async () => {
    await request(app.getHttpServer()).get('/api/learning/notes').expect(404);
    await request(app.getHttpServer()).get('/api').expect(404);
  });
});
