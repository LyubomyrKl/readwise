import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import 'reflect-metadata';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule);

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

    const config = new DocumentBuilder()
      .setTitle('Summarizer API')
      .setVersion('1.0')
      .setDescription('API for the Summarizer Gateway service')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });

    const port = process.env.PORT || 5173;
    await app.listen(port);

    logger.log(`Application is running on: ${await app.getUrl()}/api`);
    logger.log(`Swagger documentation available at: ${await app.getUrl()}/api/docs`);
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}
void bootstrap();
