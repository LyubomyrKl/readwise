import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SummarizerModule } from '@/modules/summarizer/summarizer.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { RabbitMQService } from '@/infrastructure/rabbitmq/rabbitmq.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { makeBook } from '../fixtures/book.fixture';

/**
 * HTTP-level characterization of the summarizer endpoints with every piece of
 * infrastructure mocked: validation, auth wiring, response shapes and the
 * call into the queue. Runs without Postgres, RabbitMQ or MinIO.
 */
describe('Summarizer (e2e, infrastructure mocked)', () => {
  let app: INestApplication;
  const prisma = { book: { findFirst: jest.fn() } };
  const rabbit = { publishSummaryRequest: jest.fn() };
  const s3 = { getJsonObject: jest.fn() };
  const user = { userId: 'user-1', email: 'user@example.com' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SummarizerModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RabbitMQService)
      .useValue(rabbit)
      .overrideProvider(S3Service)
      .useValue(s3)
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user?: typeof user }>().user =
            user;
          return true;
        },
      })
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/summarizer/request', () => {
    it('queues the chosen type and strategy for the caller', async () => {
      prisma.book.findFirst.mockResolvedValue({ summaryStorageKey: null });
      rabbit.publishSummaryRequest.mockResolvedValue({
        success: true,
        message: 'Summary request queued successfully',
      });

      await request(app.getHttpServer())
        .post('/api/summarizer/request')
        .send({
          bookId: 'book-1',
          summaryType: 'abstractive',
          summarizationStrategy: 'two_pass',
        })
        .expect(201)
        .expect({
          success: true,
          message: 'Summary request queued successfully',
          userId: 'user-1',
          bookId: 'book-1',
        });

      expect(rabbit.publishSummaryRequest).toHaveBeenCalledWith(
        'user-1',
        'book-1',
        'abstractive',
        'two_pass',
      );
    });

    it('defaults to an extractive summary with no explicit strategy', async () => {
      prisma.book.findFirst.mockResolvedValue({ summaryStorageKey: null });
      rabbit.publishSummaryRequest.mockResolvedValue({
        success: true,
        message: 'queued',
      });

      await request(app.getHttpServer())
        .post('/api/summarizer/request')
        .send({ bookId: 'book-1' })
        .expect(201);

      expect(rabbit.publishSummaryRequest).toHaveBeenCalledWith(
        'user-1',
        'book-1',
        'extractive',
        undefined,
      );
    });

    it('rejects an unknown strategy', async () => {
      await request(app.getHttpServer())
        .post('/api/summarizer/request')
        .send({ bookId: 'book-1', summarizationStrategy: 'magic' })
        .expect(400);

      expect(rabbit.publishSummaryRequest).not.toHaveBeenCalled();
    });

    it('rejects unexpected fields and a missing bookId', async () => {
      await request(app.getHttpServer())
        .post('/api/summarizer/request')
        .send({ bookId: 'book-1', extra: true })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/summarizer/request')
        .send({ summaryType: 'abstractive' })
        .expect(400);

      expect(rabbit.publishSummaryRequest).not.toHaveBeenCalled();
    });

    it('returns the existing key without queueing', async () => {
      prisma.book.findFirst.mockResolvedValue({
        summaryStorageKey: 'summary/book-1_abstractive_summary.json',
      });

      await request(app.getHttpServer())
        .post('/api/summarizer/request')
        .send({ bookId: 'book-1', summaryType: 'abstractive' })
        .expect(201)
        .expect({
          success: true,
          message: 'Summary already exists',
          userId: 'user-1',
          bookId: 'book-1',
          summaryKey: 'summary/book-1_abstractive_summary.json',
        });

      expect(rabbit.publishSummaryRequest).not.toHaveBeenCalled();
    });

    it('404s for a book the caller does not own', async () => {
      prisma.book.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/summarizer/request')
        .send({ bookId: 'someone-elses' })
        .expect(404);
    });
  });

  describe('GET /api/summarizer/status/:bookId', () => {
    it('reports readiness together with the stored type and strategy', async () => {
      prisma.book.findFirst.mockResolvedValue({
        id: 'book-1',
        status: 'ready',
        summaryStorageKey: 'summary/x.json',
        summaryType: 'abstractive',
        summarizationStrategy: 'two_pass',
        errorMessage: null,
      });

      await request(app.getHttpServer())
        .get('/api/summarizer/status/book-1')
        .expect(200)
        .expect({
          status: 'ready',
          bookId: 'book-1',
          isReady: true,
          summaryKey: 'summary/x.json',
          summaryType: 'abstractive',
          summarizationStrategy: 'two_pass',
          errorMessage: null,
        });
    });

    it('reports a failed run with its error message', async () => {
      prisma.book.findFirst.mockResolvedValue({
        id: 'book-1',
        status: 'error',
        summaryStorageKey: null,
        summaryType: null,
        summarizationStrategy: null,
        errorMessage: 'LLM host unreachable',
      });

      await request(app.getHttpServer())
        .get('/api/summarizer/status/book-1')
        .expect(200)
        .expect({
          status: 'error',
          bookId: 'book-1',
          isReady: false,
          errorMessage: 'LLM host unreachable',
        });
    });

    it('404s for an unknown book', async () => {
      prisma.book.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/summarizer/status/missing')
        .expect(404);
    });
  });

  describe('POST /api/summarizer/summary', () => {
    it('returns the stored summary merged with the book', async () => {
      prisma.book.findFirst.mockResolvedValue(
        makeBook({
          summaryStorageKey: 'summary/book-1_abstractive_summary.json',
        }),
      );
      s3.getJsonObject.mockResolvedValue({
        sections: [
          { id: 's1', title: 'One', level: 'chapter', content: 'Summary.' },
        ],
      });

      const res = await request(app.getHttpServer())
        .post('/api/summarizer/summary')
        .send({ bookId: 'book-1' })
        .expect(201);

      expect(res.body).toMatchObject({
        id: 'book-1',
        title: 'A Book',
        summaryKey: 'summary/book-1_abstractive_summary.json',
        summary: { sections: [{ id: 's1', title: 'One' }] },
      });
    });

    it('404s when no summary has been generated', async () => {
      prisma.book.findFirst.mockResolvedValue(makeBook());

      await request(app.getHttpServer())
        .post('/api/summarizer/summary')
        .send({ bookId: 'book-1' })
        .expect(404);

      expect(s3.getJsonObject).not.toHaveBeenCalled();
    });
  });
});
