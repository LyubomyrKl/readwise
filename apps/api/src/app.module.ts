import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { validate } from '@platform/config/env.validation';
import { LoggerModule } from '@platform/common/logger/logger.module';
import { RequestLoggerMiddleware } from '@platform/common/middleware/request-logger.middleware';
import { PrismaModule } from '@platform/db/prisma.module';
import { StorageModule } from '@platform/storage/storage.module';
import { QueueModule } from '@platform/queue/queue.module';
import { JobsModule } from '@platform/jobs/jobs.module';
import { UsersModule } from '@platform/users/users.module';
import { AuthModule } from '@platform/auth/auth.module';
import { HealthModule } from '@platform/health/health.module';
import { TOOL_MODULES } from './tool-registry';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60000, limit: 100 },
      { name: 'long', ttl: 3600000, limit: 1000 },
    ]),
    // platform
    LoggerModule,
    PrismaModule,
    StorageModule,
    QueueModule,
    JobsModule,
    UsersModule,
    AuthModule,
    HealthModule,
    // tools
    ...TOOL_MODULES,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
