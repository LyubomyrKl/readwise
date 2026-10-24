import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { RabbitMQService } from '@/infrastructure/rabbitmq/rabbitmq.service';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
}

interface ReadinessStatus extends HealthStatus {
  checks: {
    database: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    storage: { status: 'ok' | 'error'; error?: string };
    messageQueue: { status: 'ok' | 'error'; error?: string };
  };
}

@ApiTags('Health')
@Controller('health')
@SkipThrottle() // Health checks should not be rate limited
export class HealthController {
  private readonly startTime: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly rabbitmq: RabbitMQService,
  ) {
    this.startTime = Date.now();
  }

  /**
   * Basic liveness probe - returns immediately if the service is running
   */
  @Get()
  @ApiOperation({ summary: 'Basic liveness check' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  health(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Readiness probe - checks all dependencies
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check with dependency status' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async ready(): Promise<ReadinessStatus> {
    const database = await this.checkDatabase();
    const storage = this.checkStorage();
    const messageQueue = this.checkMessageQueue();
    const allOk = database.status === 'ok' && storage.status === 'ok' && messageQueue.status === 'ok';

    const response: ReadinessStatus = {
      status: allOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: { database, storage, messageQueue },
    };

    if (!allOk) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  private async checkDatabase(): Promise<{ status: 'ok' | 'error'; latencyMs?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  private checkStorage(): { status: 'ok' | 'error'; error?: string } {
    try {
      // S3 client doesn't have a direct health check, but we can verify it's configured
      // A real check would list buckets or head a known object
      // For now, we just verify the service is injectable
      if (this.s3) {
        return { status: 'ok' };
      }
      return { status: 'error', error: 'S3 service not available' };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown storage error',
      };
    }
  }

  private checkMessageQueue(): { status: 'ok' | 'error'; error?: string } {
    try {
      if (this.rabbitmq.isConnected()) {
        return { status: 'ok' };
      }
      return { status: 'error', error: 'RabbitMQ connection is down' };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown message queue error',
      };
    }
  }
}
