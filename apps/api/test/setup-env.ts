/**
 * Environment defaults for e2e specs that boot AppModule.
 *
 * ConfigModule validates these at import time. Infrastructure services are
 * mocked inside the specs themselves, so nothing here is ever connected to.
 * Values already present in the environment win.
 */
import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);

const defaults: Record<string, string> = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  S3_HOST: 'localhost',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  S3_BOOK_BUCKET_NAME: 'books',
  S3_BOOK_COVER_BUCKET_NAME: 'covers',
  S3_SUMMARIES_BUCKET_NAME: 'summaries',
  RABBITMQ_HOST: 'localhost',
  RABBITMQ_USER: 'test',
  RABBITMQ_PASS: 'test',
  REGISTRATION: 'open',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
