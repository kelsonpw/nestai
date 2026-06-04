import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { decideCriticalOverride } from '@nestai/core';
import type { PrismaClient } from '@nestai/db';

import { PRISMA, JOB_QUEUE } from '../tokens.js';
import type { JobQueue } from '../queue/job-queue.js';

/** Job names registered on the queue. */
export const JOBS = {
  DAILY_DIGEST: 'daily-digest',
  SUNDAY_CHECKIN: 'sunday-checkin',
  MILESTONE_FIRE: 'milestone-fire',
  PURGE_SWEEP: 'purge-sweep',
  ESCALATION_TIMER: 'escalation-timer',
} as const;

// Intervals for the in-memory driver (cron is used when on BullMQ).
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Registers and schedules the system's recurring jobs on the {@link JobQueue}.
 * Handlers operate across ALL households using the singleton Prisma client
 * (these are cross-tenant maintenance sweeps, not request-scoped work).
 *
 * Default driver is in-memory with `everyMs` intervals; under BullMQ the same
 * handlers can be driven by cron. Repeatable jobs are NOT started during tests
 * (NODE_ENV=test) to keep test runs deterministic.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private repeatKeys: string[] = [];

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerHandlers();
    if (process.env.NODE_ENV === 'test' || process.env.NESTAI_DISABLE_SCHEDULER) {
      return;
    }
    await this.scheduleRepeatables();
  }

  async onModuleDestroy(): Promise<void> {
    for (const key of this.repeatKeys) {
      await this.queue.removeRepeatable(key).catch(() => undefined);
    }
    await this.queue.close().catch(() => undefined);
  }

  private registerHandlers(): void {
    this.queue.register(JOBS.DAILY_DIGEST, async () => {
      await this.runDailyDigest();
    });
    this.queue.register(JOBS.SUNDAY_CHECKIN, async () => {
      await this.runSundayCheckin();
    });
    this.queue.register(JOBS.MILESTONE_FIRE, async () => {
      await this.fireMilestones();
    });
    this.queue.register(JOBS.PURGE_SWEEP, async () => {
      await this.purgeSweep();
    });
    this.queue.register(JOBS.ESCALATION_TIMER, async () => {
      await this.escalationTimer();
    });
  }

  private async scheduleRepeatables(): Promise<void> {
    // The in-memory driver checks frequently and the handlers themselves gate on
    // the household's local digest/check-in time, milestone fireAt, purgeAfter,
    // and escalation deadlines.
    this.repeatKeys.push(
      await this.queue.repeat(JOBS.DAILY_DIGEST, {}, { everyMs: 15 * MINUTE, cron: '*/15 * * * *' }),
      await this.queue.repeat(JOBS.SUNDAY_CHECKIN, {}, { everyMs: 15 * MINUTE, cron: '*/15 * * * *' }),
      await this.queue.repeat(JOBS.MILESTONE_FIRE, {}, { everyMs: 5 * MINUTE, cron: '*/5 * * * *' }),
      await this.queue.repeat(JOBS.PURGE_SWEEP, {}, { everyMs: HOUR, cron: '0 * * * *' }),
      await this.queue.repeat(JOBS.ESCALATION_TIMER, {}, { everyMs: MINUTE, cron: '* * * * *' }),
    );
  }

  /* --------------------------- job handlers ------------------------------ */

  /** Per-household daily digest (gated on each household's digest time). */
  async runDailyDigest(now: Date = new Date()): Promise<number> {
    const households = await this.prisma.household.findMany();
    let fired = 0;
    for (const hh of households) {
      if (this.matchesLocalTime(hh.digestTimeLocal, hh.timezone, now)) fired++;
    }
    return fired;
  }

  /** Sunday check-in (gated on Sunday + each household's check-in time). */
  async runSundayCheckin(now: Date = new Date()): Promise<number> {
    if (now.getUTCDay() !== 0) return 0;
    const households = await this.prisma.household.findMany();
    let fired = 0;
    for (const hh of households) {
      if (this.matchesLocalTime(hh.sundayCheckinTimeLocal, hh.timezone, now)) {
        fired++;
      }
    }
    return fired;
  }

  /** Fire any due milestones (fireAt <= now, not yet fired) across households. */
  async fireMilestones(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.milestone.findMany({
      where: { fired: false, fireAt: { lte: now } },
    });
    if (due.length === 0) return 0;
    await this.prisma.milestone.updateMany({
      where: { id: { in: due.map((m) => m.id) } },
      data: { fired: true },
    });
    return due.length;
  }

  /**
   * 24h ephemeral purge sweep: delete raw text/media of RawMessages and raw
   * source of AvailabilityBlocks whose retention window has elapsed.
   */
  async purgeSweep(now: Date = new Date()): Promise<{
    messages: number;
    blocks: number;
  }> {
    const messages = await this.prisma.rawMessage.updateMany({
      where: { purgeAfter: { lte: now }, rawText: { not: '' } },
      data: { rawText: '', scrubbedText: null, mediaUrl: null, mediaType: null, tokenMap: undefined },
    });
    const blocks = await this.prisma.availabilityBlock.deleteMany({
      where: { purgeRawAfter: { lte: now } },
    });
    return { messages: messages.count, blocks: blocks.count };
  }

  /**
   * Escalation timer: bump unbroadcast OFFERs to broadcast after 10m, and decide
   * CRITICAL_OVERRIDE for events within 20m of the deadline.
   */
  async escalationTimer(now: Date = new Date()): Promise<{
    broadcast: number;
    overrides: number;
  }> {
    const open = await this.prisma.escalationEvent.findMany({
      where: { resolvedAt: null },
    });
    let broadcast = 0;
    let overrides = 0;
    const tenMinAgo = new Date(now.getTime() - 10 * MINUTE);
    for (const e of open) {
      if (e.broadcastAt == null && e.createdAt <= tenMinAgo) {
        await this.prisma.escalationEvent.update({
          where: { id: e.id },
          data: { broadcastAt: now },
        });
        broadcast++;
      }
      const decision = decideCriticalOverride(
        {
          householdId: e.householdId,
          taskId: e.taskId,
          tier: e.tier,
          deadline: e.deadline.toISOString(),
          claimedById: e.claimedById ?? undefined,
          resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : undefined,
        },
        now,
      );
      if (decision.override) overrides++;
    }
    return { broadcast, overrides };
  }

  /**
   * True when `now` (in the given IANA tz) matches "HH:mm" within the job's
   * cadence window. Uses Intl to read the local hour/minute; falls back to UTC.
   */
  private matchesLocalTime(hhmm: string, timezone: string, now: Date): boolean {
    const parts0 = hhmm.split(':');
    const h = Number(parts0[0]);
    const m = Number(parts0[1]);
    if (Number.isNaN(h) || Number.isNaN(m)) return false;
    let localHour: number;
    let localMin: number;
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = fmt.formatToParts(now);
      localHour = Number(parts.find((p) => p.type === 'hour')?.value ?? 'NaN');
      localMin = Number(parts.find((p) => p.type === 'minute')?.value ?? 'NaN');
    } catch {
      localHour = now.getUTCHours();
      localMin = now.getUTCMinutes();
    }
    // Match within a 15-minute window aligned to the digest cadence.
    return localHour === h && Math.abs(localMin - m) < 15;
  }
}
