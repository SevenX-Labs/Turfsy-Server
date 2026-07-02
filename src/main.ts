import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { json } from 'express';
import { SecurityExceptionFilter } from './common/filters/security-exception.filter';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  // ── Layer 1: Secure HTTP Headers ──
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow mobile app embeds
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );

  // ── Layer 2: Cross-Origin Resource Sharing ──
  app.enableCors({
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',')
      : [
          'http://localhost:3000',
          'http://localhost:5173',
          'http://localhost:8081',
        ],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-forwarded-for',
      'x-cron-secret',
      'x-razorpay-signature',
    ],
    maxAge: 86400, // Cache preflight for 24h
  });

  // ── Layer 3: Gzip Compression (reduces payload size ~70%) ──
  app.use(
    compression({
      threshold: 1024, // Only compress responses > 1KB
      level: 6, // Balanced speed/compression
    }),
  );

  // ── Layer 4: Payload Size Limits & Raw Body for Webhooks ──
  app.use(
    json({
      limit: '1mb', // Tightened from 5mb — no endpoint needs > 1MB JSON
      verify: (req, _res, buf) => {
        if (buf?.length) {
          (req as any).rawBody = buf;
        }
      },
    }),
  );

  // ── Layer 5: Global validation pipe (class-validator) ──
  // whitelist: strip unexpected fields (strict mode)
  // forbidNonWhitelisted: reject requests with extra fields
  // transform: auto-transform payloads to DTO instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  // ── Layer 6: Global exception filter (generic error messages) ──
  app.useGlobalFilters(new SecurityExceptionFilter());

  // Serve static assets from the "uploads" directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
    maxAge: '1d', // Cache static assets for 1 day
  });

  // ── Disable express header that leaks tech stack ──
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`Server started successfully on port ${port}`, 'Bootstrap');
}
bootstrap();
