import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '@/app.module';

describe('Learning Module (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    // Note: In a real test, you would authenticate here
    // For now, these tests will fail without a valid auth token
    // This is just a template for E2E testing structure
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/api/learning/notes (POST)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .post('/api/learning/notes')
        .send({
          targetSentence: 'Test sentence',
          meaning: 'Test meaning',
          targetWord: 'test',
        })
        .expect(401);
    });
  });

  describe('/api/learning/notes/validate (POST)', () => {
    it('should validate note content', () => {
      return request(app.getHttpServer())
        .post('/api/learning/notes/validate')
        .send({
          targetSentence: 'Valid sentence here.',
          meaning: 'Valid meaning',
          targetWord: 'valid',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('isValid');
          expect(res.body).toHaveProperty('warnings');
          expect(res.body).toHaveProperty('errors');
        });
    });

    it('should return validation errors for empty content', () => {
      return request(app.getHttpServer())
        .post('/api/learning/notes/validate')
        .send({
          targetSentence: '',
          meaning: '',
          targetWord: '',
        })
        .expect(400);
    });
  });

  describe('/api/learning/study/queue (GET)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/api/learning/study/queue')
        .expect(401);
    });
  });

  describe('/api/learning/stats (GET)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/api/learning/stats')
        .expect(401);
    });
  });

  describe('/api/learning/settings (GET)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/api/learning/settings')
        .expect(401);
    });
  });

  describe('/api/learning/export (GET)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/api/learning/export')
        .expect(401);
    });
  });

  describe('/api/learning/import (POST)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .post('/api/learning/import')
        .send({
          version: '1.0',
          notes: [],
        })
        .expect(401);
    });
  });
});
