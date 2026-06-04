import type {
  JobQueue,
  JobHandler,
  EnqueueOptions,
  RepeatOptions,
} from './job-queue.js';

/**
 * Zero-infra default {@link JobQueue}. Runs jobs in-process using `setTimeout`
 * (delayed/one-shot) and `setInterval` (repeatable). Handler errors are caught
 * and logged so a single failing job never crashes the scheduler.
 *
 * Cron is not supported here (use the BullMQ driver for cron); callers schedule
 * recurring work with `everyMs`.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly timeouts = new Set<NodeJS.Timeout>();
  private readonly intervals = new Map<string, NodeJS.Timeout>();
  private seq = 0;

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async enqueue(
    name: string,
    payload?: unknown,
    opts: EnqueueOptions = {},
  ): Promise<void> {
    const delay = Math.max(0, opts.delayMs ?? 0);
    const t = setTimeout(() => {
      this.timeouts.delete(t);
      void this.run(name, payload);
    }, delay);
    // Don't keep the event loop alive purely for pending jobs.
    if (typeof t.unref === 'function') t.unref();
    this.timeouts.add(t);
  }

  async repeat(
    name: string,
    payload: unknown,
    opts: RepeatOptions,
  ): Promise<string> {
    if (opts.everyMs == null) {
      throw new Error(
        'InMemoryJobQueue.repeat requires `everyMs` (cron is BullMQ-only).',
      );
    }
    const key = `${name}#${++this.seq}`;
    const interval = setInterval(() => {
      void this.run(name, payload);
    }, opts.everyMs);
    if (typeof interval.unref === 'function') interval.unref();
    this.intervals.set(key, interval);
    return key;
  }

  async removeRepeatable(key: string): Promise<void> {
    const interval = this.intervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(key);
    }
  }

  async close(): Promise<void> {
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts.clear();
    for (const interval of this.intervals.values()) clearInterval(interval);
    this.intervals.clear();
  }

  private async run(name: string, payload: unknown): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) return;
    try {
      await handler(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[InMemoryJobQueue] job "${name}" failed:`, err);
    }
  }
}
