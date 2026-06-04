import type {
  JobQueue,
  JobHandler,
  EnqueueOptions,
  RepeatOptions,
} from './job-queue.js';

/**
 * BullMQ-backed {@link JobQueue}, activated only when `REDIS_URL` is set.
 *
 * `bullmq` is NOT a hard dependency of this package: it is loaded via a dynamic
 * import inside {@link init} so the app boots with zero infra when Redis is
 * absent. This is a compile-only skeleton in the sandbox — wiring is in place
 * but exercised only in environments that have both Redis and `bullmq`.
 */
export class BullMqJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler>();
  private queues = new Map<string, unknown>();
  private workers: unknown[] = [];
  private bull: any;
  private initialized = false;

  constructor(private readonly redisUrl: string) {}

  /** Lazily import bullmq and build the connection. Throws if bullmq is absent. */
  private async init(): Promise<void> {
    if (this.initialized) return;
    try {
      // Dynamic import keeps bullmq optional so the app boots without it.
      this.bull = await import('bullmq' as string);
    } catch {
      throw new Error(
        'REDIS_URL is set but the optional `bullmq` dependency is not installed.',
      );
    }
    this.initialized = true;
  }

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  private connection() {
    return { connection: { url: this.redisUrl } };
  }

  private async getQueue(name: string): Promise<any> {
    await this.init();
    let q = this.queues.get(name);
    if (!q) {
      q = new this.bull.Queue(name, this.connection());
      // One worker per queue, dispatching to the registered handler.
      const worker = new this.bull.Worker(
        name,
        async (job: { data: unknown }) => {
          const handler = this.handlers.get(name);
          if (handler) await handler(job.data);
        },
        this.connection(),
      );
      this.workers.push(worker);
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue(
    name: string,
    payload?: unknown,
    opts: EnqueueOptions = {},
  ): Promise<void> {
    const q = await this.getQueue(name);
    await q.add(name, payload ?? {}, { delay: opts.delayMs });
  }

  async repeat(
    name: string,
    payload: unknown,
    opts: RepeatOptions,
  ): Promise<string> {
    const q = await this.getQueue(name);
    const repeat = opts.cron
      ? { pattern: opts.cron }
      : { every: opts.everyMs };
    await q.add(name, payload ?? {}, { repeat });
    return `${name}:${opts.cron ?? opts.everyMs}`;
  }

  async removeRepeatable(key: string): Promise<void> {
    const [name, spec] = key.split(':');
    if (!name) return;
    const q = await this.getQueue(name);
    const repeat = /^\d+$/.test(spec ?? '')
      ? { every: Number(spec) }
      : { pattern: spec };
    await q.removeRepeatable(name, repeat);
  }

  async close(): Promise<void> {
    for (const w of this.workers) {
      await (w as { close?: () => Promise<void> }).close?.();
    }
    for (const q of this.queues.values()) {
      await (q as { close?: () => Promise<void> }).close?.();
    }
    this.workers = [];
    this.queues.clear();
  }
}
