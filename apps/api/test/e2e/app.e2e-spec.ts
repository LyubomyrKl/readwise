import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { RabbitMQService } from '@/infrastructure/rabbitmq/rabbitmq.service';
import { S3Service } from '@/infrastructure/s3/s3.service';

/**
 * Boots the whole AppModule with every piece of infrastructure mocked.
 * Catches wiring mistakes (a removed module still imported, a provider without
 * its dependencies) without Postgres, RabbitMQ or MinIO. Environment defaults
 * for ConfigModule's validation come from test/setup-env.ts.
 */
describe('AppModule (boot, infrastructure mocked)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .overrideProvider(RabbitMQService)
      .useValue({ isConnected: () => true })
      .overrideProvider(S3Service)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the liveness and readiness probes', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({ status: 'ok' });
      });

    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          status: 'ok',
          checks: { database: { status: 'ok' } },
        });
      });
  });

  it('protects application routes with the JWT guard', async () => {
    await request(app.getHttpServer()).get('/api/books').expect(401);
    await request(app.getHttpServer())
      .post('/api/summarizer/request')
      .send({ bookId: 'book-1' })
      .expect(401);
  });

  it('no longer exposes the learning and dictionary APIs', async () => {
    await request(app.getHttpServer()).get('/api/learning/notes').expect(404);
    await request(app.getHttpServer())
      .get('/api/dictionary/entries')
      .expect(404);
  });
});
