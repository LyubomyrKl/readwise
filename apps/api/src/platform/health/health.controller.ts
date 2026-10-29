import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '@platform/db/prisma.service';
import { StorageService } from '@platform/storage/storage.service';
import { QueueService } from '@platform/queue/queue.service';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
}

type Check = { status: 'ok' | 'error'; latencyMs?: number; error?: string };

interface ReadinessStatus extends HealthStatus {
  checks: {
    database: Check;
    storage: Check;
    messageQueue: Check;
  };
}

@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  /** Liveness: the process answers. */
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

  /** Readiness: a query against Postgres, a HeadBucket against S3, an open AMQP connection. */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check with dependency status' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async ready(): Promise<ReadinessStatus> {
    const [database, storage] = await Promise.all([
      this.timed('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.timed('storage', () => this.storage.ping()),
    ]);
    const messageQueue: Check = this.queue.isConnected()
      ? { status: 'ok' }
      : { status: 'error', error: 'RabbitMQ connection is down' };

    const allOk = [database, storage, messageQueue].every((c) => c.status === 'ok');
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

  /** The reason of a failed check goes to the log: the endpoint is public, and messages carry hosts and names. */
  private async timed(name: string, probe: () => Promise<unknown>): Promise<Check> {
    const start = Date.now();
    try {
      await probe();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.warn(`readiness: ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
      return { status: 'error', error: `${name} unreachable` };
    }
  }
}
