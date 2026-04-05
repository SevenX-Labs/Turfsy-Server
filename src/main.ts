import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { json } from 'express';
import { SecurityExceptionFilter } from './common/filters/security-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();

  app.use(
    json({
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
