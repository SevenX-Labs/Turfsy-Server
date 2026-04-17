import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // ── Optimized Connection Pooling ──
      max: 20,                       // Increased from 15 for higher concurrency
      min: 5,                        // Keep minimum warm connections
      idleTimeoutMillis: 30000,      // Release idle connections after 30s
      connectionTimeoutMillis: 5000, // Reduced from 10s — fail fast if DB is down
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      statement_timeout: 30000,      // Kill queries running > 30s
    });
    const adapter = new PrismaPg(pool as any);
    super({
      adapter,
      log:
        process.env.NODE_ENV === 'production'
          ? ['error']
          : ['query', 'info', 'warn', 'error'],
    });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database connections closed');
  }
}
