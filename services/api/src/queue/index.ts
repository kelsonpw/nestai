import type { JobQueue } from './job-queue.js';
import { InMemoryJobQueue } from './in-memory-job-queue.js';
import { BullMqJobQueue } from './bullmq-job-queue.js';

export type {
  JobQueue,
  JobHandler,
  EnqueueOptions,
  RepeatOptions,
} from './job-queue.js';
export { InMemoryJobQueue } from './in-memory-job-queue.js';
export { BullMqJobQueue } from './bullmq-job-queue.js';

/**
 * Select the queue driver: BullMQ when `REDIS_URL` is present, otherwise the
 * zero-infra in-memory driver (the sandbox default — no Redis, no Docker).
 */
export function createJobQueue(): JobQueue {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.trim().length > 0) {
    return new BullMqJobQueue(redisUrl.trim());
  }
  return new InMemoryJobQueue();
}
