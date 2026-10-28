import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SessionThrottlerGuard } from '@platform/common/throttle.guard';
import { ConfigModule } from '@nestjs/config';
import { validate } from '@platform/config/env.validation';
import { LoggerModule } from '@platform/common/logger/logger.module';
import { RequestLoggerMiddleware } from '@platform/common/middleware/request-logger.middleware';
import { PrismaModule } from '@platform/db/prisma.module';
import { StorageModule } from '@platform/storage/storage.module';
import { QueueModule } from '@platform/queue/queue.module';
import { JobsModule } from '@platform/jobs/jobs.module';
import { AiModule } from '@platform/ai/ai.module';
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
    // Per session (or per client address when anonymous), see SessionThrottlerGuard.
    // The credential endpoints override these with much smaller budgets.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 30 },
      { name: 'medium', ttl: 60_000, limit: 600 },
      { name: 'long', ttl: 3_600_000, limit: 10_000 },
    ]),
    // platform
    LoggerModule,
    PrismaModule,
    StorageModule,
    QueueModule,
    JobsModule,
    AiModule,
    UsersModule,
    AuthModule,
    HealthModule,
    // tools
    ...TOOL_MODULES,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SessionThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
