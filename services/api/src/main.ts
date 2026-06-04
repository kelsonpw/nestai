/**
 * @nestai/api — NestJS bootstrap.
 *
 * Boots the household-orchestrator API with:
 *   - CORS enabled (for the GitHub Pages dashboard)
 *   - PORT from env (default 3000)
 *
 * Providers default to mock (PROVIDER_MODE=mock) and the queue to the in-memory
 * driver (no Redis), so the app boots with zero infra.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // CORS for the GitHub Pages dashboard (and local dev).
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    allowedHeaders: ['content-type', 'x-household-id', 'authorization'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`nestai api listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start nestai api', err);
  process.exit(1);
});
