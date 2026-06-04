import { Injectable, NotFoundException } from '@nestjs/common';
import {
  findMicroWindows,
  computeBalanceBattery,
  type BusyBlock,
} from '@nestai/core';
import type {
  Member,
  WellnessGoal,
  WellnessWindow,
  Task,
} from '@nestai/contracts';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

export interface WellnessGoalInput {
  memberId: string;
  kind: 'GYM' | 'QUIET' | 'DATE_NIGHT' | 'CUSTOM';
  targetCount: number;
  durationMin: number;
  period: 'WEEKLY' | 'BIWEEKLY';
}

@Injectable()
export class WellbeingService {
  constructor(private readonly db: TenantPrisma) {}

  async listGoals(memberId?: string) {
    const rows = await this.db.raw.wellnessGoal.findMany({
      where: this.db.where(memberId ? { memberId } : {}),
    });
    return rows.map((g) => isoify(g));
  }

  async setGoal(input: WellnessGoalInput) {
    const row = await this.db.raw.wellnessGoal.create({
      data: this.db.data(input) as Prisma.WellnessGoalUncheckedCreateInput,
    });
    return isoify(row);
  }

  /**
   * Suggest micro-windows for a member's wellness goals (core engine), using
   * the member's busy availability blocks, and persist them as SUGGESTED.
   */
  async suggestWindows(memberId: string, rangeStart: string, rangeEnd: string) {
    const member = await this.db.raw.member.findUnique({ where: { id: memberId } });
    const owned = this.db.assertOwned(member);
    if (!owned) throw new NotFoundException('Member not found');

    const goals = (await this.db.raw.wellnessGoal.findMany({
      where: this.db.where({ memberId }),
    })) as unknown as WellnessGoal[];

    const blocks = await this.db.raw.availabilityBlock.findMany({
      where: this.db.where({ memberId }),
    });
    const busy: BusyBlock[] = blocks
      .filter((b) => b.kind !== 'AVAILABLE')
      .map((b) => ({
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        label: `${b.kind}`,
      }));

    const drafts = findMicroWindows({
      member: isoify(owned) as unknown as Member,
      goals: goals.map((g) => isoify(g)),
      busy,
      rangeStart,
      rangeEnd,
      now: new Date(),
    });

    const created = [];
    for (const d of drafts) {
      const row = await this.db.raw.wellnessWindow.create({
        data: this.db.data({
          memberId: d.memberId,
          goalId: d.goalId,
          startsAt: new Date(d.startsAt),
          endsAt: new Date(d.endsAt),
          status: d.status ?? 'SUGGESTED',
        }) as Prisma.WellnessWindowUncheckedCreateInput,
      });
      created.push(isoify(row));
    }
    return created;
  }

  /** Compute a member's balance battery (goal completion + logistics share). */
  async balanceBattery(memberId: string) {
    const member = await this.db.raw.member.findUnique({ where: { id: memberId } });
    const owned = this.db.assertOwned(member);
    if (!owned) throw new NotFoundException('Member not found');

    const goals = (await this.db.raw.wellnessGoal.findMany({
      where: this.db.where({ memberId }),
    })) as unknown as WellnessGoal[];
    const windows = (await this.db.raw.wellnessWindow.findMany({
      where: this.db.where({ memberId }),
    })) as unknown as WellnessWindow[];
    const tasks = (await this.db.raw.task.findMany({
      where: this.db.where(),
    })) as unknown as Task[];
    const members = (await this.db.raw.member.findMany({
      where: this.db.where({ active: true }),
    })) as unknown as Member[];

    return computeBalanceBattery({
      member: isoify(owned) as unknown as Member,
      goals: goals.map((g) => isoify(g)),
      windows: windows.map((w) => isoify(w)),
      tasks: tasks.map((t) => isoify(t)),
      members: members.map((m) => isoify(m)),
    });
  }
}
