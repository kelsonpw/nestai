import { Global, Module } from '@nestjs/common';
import { prisma } from '@nestai/db';
import {
  createProviders,
  configFromEnv,
  type Providers,
} from '@nestai/adapters';

import {
  PRISMA,
  PROVIDERS,
  LLM_PROVIDER,
  CALENDAR_PROVIDER,
  EMAIL_PROVIDER,
  MESSAGING_PROVIDER,
  OCR_PROVIDER,
  JOB_QUEUE,
} from '../tokens.js';
import { createJobQueue } from '../queue/index.js';
import type { JobQueue } from '../queue/job-queue.js';

/**
 * Composition root for shared singletons:
 *   - the singleton Prisma client from `@nestai/db`
 *   - the provider bundle built via `createProviders(configFromEnv())`, exposed
 *     both as a bundle (PROVIDERS) and per-adapter tokens (LLM_PROVIDER, ...)
 *   - the {@link JobQueue} (in-memory by default; BullMQ when REDIS_URL is set)
 *
 * Marked @Global so feature modules inject these tokens without re-importing.
 */
const providersFactory = {
  provide: PROVIDERS,
  useFactory: (): Providers => createProviders(configFromEnv()),
};

@Global()
@Module({
  providers: [
    { provide: PRISMA, useValue: prisma },
    providersFactory,
    { provide: LLM_PROVIDER, useFactory: (p: Providers) => p.llm, inject: [PROVIDERS] },
    { provide: CALENDAR_PROVIDER, useFactory: (p: Providers) => p.calendar, inject: [PROVIDERS] },
    { provide: EMAIL_PROVIDER, useFactory: (p: Providers) => p.email, inject: [PROVIDERS] },
    { provide: MESSAGING_PROVIDER, useFactory: (p: Providers) => p.messaging, inject: [PROVIDERS] },
    { provide: OCR_PROVIDER, useFactory: (p: Providers) => p.ocr, inject: [PROVIDERS] },
    { provide: JOB_QUEUE, useFactory: (): JobQueue => createJobQueue() },
  ],
  exports: [
    PRISMA,
    PROVIDERS,
    LLM_PROVIDER,
    CALENDAR_PROVIDER,
    EMAIL_PROVIDER,
    MESSAGING_PROVIDER,
    OCR_PROVIDER,
    JOB_QUEUE,
  ],
})
export class InfraModule {}
