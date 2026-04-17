import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { json } from 'express';
import { SecurityExceptionFilter } from './common/filters/security-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ── Layer 1: Secure HTTP Headers ──
  app.use(helmet());

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
  });

  // ── Layer 3: Payload Size Limits & Raw Body for Webhooks ──
  app.use(
    json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        if (buf?.length) {
          (req as any).rawBody = buf;
        }
      },
    }),
  );

  // ── Layer 10: Global validation pipe (class-validator) ──
  // whitelist: strip unexpected fields (strict mode)
  // forbidNonWhitelisted: reject requests with extra fields
  // transform: auto-transform payloads to DTO instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Layer 11: Global exception filter (generic error messages) ──
  app.useGlobalFilters(new SecurityExceptionFilter());

  // Serve static assets from the "uploads" directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
