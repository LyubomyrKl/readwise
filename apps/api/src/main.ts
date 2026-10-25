import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from '@platform/common/filters/sentry-exception.filter';
import { PinoLoggerService } from '@platform/common/logger/logger.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
      enabled: process.env.NODE_ENV === 'production',
    });
    logger.log('Sentry initialized');
  }

  try {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    // pino is the logger for everything, including Nest's own lines.
    app.useLogger(app.get(PinoLoggerService));

    // Standard security headers. CSP stays off because the only HTML this service
    // serves is Swagger UI, which needs inline scripts; every other response is JSON.
    app.use(helmet({ contentSecurityPolicy: false }));

    app.setGlobalPrefix('api');

    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin && process.env.NODE_ENV === 'production') {
      logger.warn('CORS_ORIGIN not set in production - defaulting to same-origin only');
    }
    app.enableCors({
      origin: corsOrigin || (process.env.NODE_ENV === 'production' ? false : true),
      credentials: true,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        disableErrorMessages: process.env.NODE_ENV === 'production',
      }),
    );

    if (process.env.SENTRY_DSN) {
      app.useGlobalFilters(new SentryExceptionFilter());
    }

    const config = new DocumentBuilder()
      .setTitle('Workbench API')
      .setVersion('1.0')
      .setDescription('HTTP API of the Workbench personal toolbox')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });

    app.enableShutdownHooks();

    const port = process.env.PORT || 5173;
    await app.listen(port);

    logger.log(`Application is running on: ${await app.getUrl()}/api (APP_MODE=${process.env.APP_MODE || 'all'})`);
    logger.log(`Swagger documentation available at: ${await app.getUrl()}/api/docs`);
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}
void bootstrap();
