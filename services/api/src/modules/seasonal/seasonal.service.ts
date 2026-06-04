import { Injectable, NotFoundException } from '@nestjs/common';
import { computeMilestones } from '@nestai/core';
import type { SeasonalProject, RegistrationTimeline } from '@nestai/contracts';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

export interface CreateSeasonalInput {
  kind: 'CAMP' | 'SPORTS' | 'CAMPSITE' | 'SKI_TRIP' | 'TRIP';
  title: string;
  status?: 'SEARCHING' | 'TRACKING' | 'CONFIRMED';
  targetWindow?: { start: string; end: string };
  location?: unknown;
  /** Optional explicit goal/open date that anchors the milestones. */
  goalDate?: string;
}

@Injectable()
export class SeasonalService {
  constructor(private readonly db: TenantPrisma) {}

  async list() {
    const rows = await this.db.raw.seasonalProject.findMany({
      where: this.db.where(),
      orderBy: { createdAt: 'desc' },
      include: { milestones: true },
    });
    return rows.map((r) => isoify(r));
  }

  /**
   * Create a seasonal project and schedule its four staged milestones via the
   * core seasonal engine, persisting them.
   */
  async create(input: CreateSeasonalInput) {
    const project = await this.db.raw.seasonalProject.create({
      data: this.db.data({
        kind: input.kind,
        title: input.title,
        status: input.status ?? 'SEARCHING',
        targetWindow: input.targetWindow as unknown as Prisma.InputJsonValue,
        location: input.location as Prisma.InputJsonValue,
      }) as Prisma.SeasonalProjectUncheckedCreateInput,
    });

    // Find a matching registration timeline (kind) to anchor the goal date.
    const timelineRow = await this.db.raw.registrationTimeline.findFirst({
      where: this.db.where({ kind: input.kind }),
    });

    // computeMilestones throws if no anchor (goalDate / timeline / targetWindow)
    // is resolvable; in that case we persist the project without milestones.
    try {
      const milestones = computeMilestones({
        project: isoify(project) as unknown as SeasonalProject,
        timeline: timelineRow
          ? (isoify(timelineRow) as unknown as RegistrationTimeline)
          : undefined,
        goalDate: input.goalDate,
        now: new Date(),
      });

      await this.db.raw.milestone.createMany({
        data: milestones.map((m) => ({
          householdId: this.db.householdId,
          seasonalProjectId: project.id,
          stage: m.stage,
          fireAt: new Date(m.fireAt),
          content: m.content,
          fired: false,
        })),
      });
    } catch {
      // No resolvable goal date — leave milestones empty for now.
    }

    const fresh = await this.db.raw.seasonalProject.findUnique({
      where: { id: project.id },
      include: { milestones: true },
    });
    return isoify(fresh);
  }

  async get(id: string) {
    const row = await this.db.raw.seasonalProject.findUnique({
      where: { id },
      include: { milestones: true },
    });
    const owned = this.db.assertOwned(row);
    if (!owned) throw new NotFoundException('Seasonal project not found');
    return isoify(owned);
  }
}
