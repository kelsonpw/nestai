import { Injectable, NotFoundException } from '@nestjs/common';
import {
  selectBackup,
  classifyUrgencyCascade,
  decideCriticalOverride,
} from '@nestai/core';
import type { Member, AvailabilityBlock } from '@nestai/contracts';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

/** Minutes after a drop before an OFFER escalates to a household-wide broadcast. */
export const BROADCAST_AFTER_MINUTES = 10;

@Injectable()
export class EscalationService {
  constructor(private readonly db: TenantPrisma) {}

  async list() {
    const rows = await this.db.raw.escalationEvent.findMany({
      where: this.db.where(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((e) => isoify(e));
  }

  /**
   * Broadcast an escalation: select the best backup adult via the core engine,
   * mark the event broadcast, and (for HIGH/CRITICAL) widen to the whole pool.
   */
  async broadcast(escalationId: string, excludeMemberIds: string[] = []) {
    const event = await this.db.raw.escalationEvent.findUnique({
      where: { id: escalationId },
    });
    const owned = this.db.assertOwned(event);
    if (!owned) throw new NotFoundException('Escalation not found');

    const task = await this.db.raw.task.findUnique({
      where: { id: owned.taskId },
    });

    const members = (await this.db.raw.member.findMany({
      where: this.db.where({ active: true }),
    })) as unknown as Member[];
    const availability = (await this.db.raw.availabilityBlock.findMany({
      where: this.db.where(),
    })) as unknown as AvailabilityBlock[];

    const windowStart = task?.dueAt ?? new Date();
    const windowEnd = new Date(
      (task?.dueAt?.getTime() ?? Date.now()) + 2 * 3600 * 1000,
    );

    const cascade = classifyUrgencyCascade(task?.urgency ?? 'MED');
    const selection = selectBackup({
      members: members.map((m) => isoify(m)),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      availability: availability.map((a) => isoify(a)),
      excludeMemberIds,
    });

    await this.db.raw.escalationEvent.update({
      where: { id: escalationId },
      data: { broadcastAt: new Date() },
    });

    return {
      cascade,
      selected: selection.selected ? isoify(selection.selected) : null,
      candidates: selection.candidates.map((c) => ({
        member: isoify(c.member),
        score: c.score,
        reasons: c.reasons,
      })),
      rationale: selection.rationale,
    };
  }

  /**
   * Sweep open escalations and decide critical overrides (within 20m of the
   * deadline with no claim). Called by the escalation timer job.
   */
  async sweepCriticalOverrides(now: Date = new Date()) {
    const open = await this.db.raw.escalationEvent.findMany({
      where: this.db.where({ resolvedAt: null }),
    });
    const overrides: string[] = [];
    for (const e of open) {
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
      if (decision.override) overrides.push(e.id);
    }
    return { checked: open.length, overrides };
  }
}
