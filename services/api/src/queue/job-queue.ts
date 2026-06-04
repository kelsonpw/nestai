/**
 * Queue / scheduler port.
 *
 * The app depends only on this interface. The default driver is in-memory
 * (zero infra, uses timers); a BullMQ driver is selected only when `REDIS_URL`
 * is set. Both support one-shot, delayed and repeatable (interval/cron) jobs.
 */

/** A handler for a job of a given name. */
export type JobHandler = (payload: unknown) => void | Promise<void>;

export interface EnqueueOptions {
  /** Delay before the job runs, in milliseconds. */
  delayMs?: number;
}

export interface RepeatOptions {
  /** Fixed interval between runs, in milliseconds. */
  everyMs?: number;
  /**
   * Cron expression (BullMQ driver only). The in-memory driver does not parse
   * cron; callers should prefer `everyMs` for the in-memory default.
   */
  cron?: string;
}

export interface JobQueue {
  /** Register a handler for a named job. */
  register(name: string, handler: JobHandler): void;

  /** Enqueue a one-shot (optionally delayed) job. */
  enqueue(name: string, payload?: unknown, opts?: EnqueueOptions): Promise<void>;

  /** Register a repeatable/cron job. Returns a key usable with `removeRepeatable`. */
  repeat(name: string, payload: unknown, opts: RepeatOptions): Promise<string>;

  /** Cancel a repeatable job previously registered via `repeat`. */
  removeRepeatable(key: string): Promise<void>;

  /** Tear down all timers/connections (used on shutdown + in tests). */
  close(): Promise<void>;
}
