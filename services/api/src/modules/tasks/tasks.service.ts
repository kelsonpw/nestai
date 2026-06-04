import { Injectable, NotFoundException } from '@nestjs/common';
import { route as routeTask, claim as claimEscalation } from '@nestai/core';
import type { Member, RoutingRule, TaskDraft } from '@nestai/contracts';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

export interface CreateTaskInput {
  title: string;
  description?: string;
  dueAt?: string;
  urgency?: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
  category: TaskDraft['category'];
  requiredSkills?: string[];
  minAge?: number;
  maxAge?: number;
  requiresApproval?: boolean;
  recurrenceRule?: string;
  sourceMessageId?: string;
  confidence?: number;
  /** Skip auto-routing on create (default false → route). */
  noRoute?: boolean;
}

@Injectable()
export class TasksService {
  constructor(private readonly db: TenantPrisma) {}

  async list(status?: string) {
    const rows = await this.db.raw.task.findMany({
      where: this.db.where(status ? { status: status as never } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((t) => isoify(t));
  }

  async get(id: string) {
    const row = await this.db.raw.task.findUnique({ where: { id } });
    const owned = this.db.assertOwned(row);
    if (!owned) throw new NotFoundException('Task not found');
    return isoify(owned);
  }

  /** Create a task and (unless suppressed) route it to the best member. */
  async create(input: CreateTaskInput) {
    const { noRoute, ...rest } = input;
    const created = await this.db.raw.task.create({
      data: this.db.data({
        ...rest,
        urgency: rest.urgency ?? 'MED',
        requiredSkills: rest.requiredSkills ?? [],
        requiresApproval: rest.requiresApproval ?? false,
        confidence: rest.confidence ?? 1,
      }) as Prisma.TaskUncheckedCreateInput,
    });

    if (noRoute) return { task: isoify(created), routing: null };

    const routing = await this.routeAndAssign(created.id);
    const fresh = await this.db.raw.task.findUnique({ where: { id: created.id } });
    return { task: isoify(fresh), routing };
  }

  /** Run the core routing engine against a task and persist the assignee. */
  async routeAndAssign(taskId: string) {
    const task = await this.db.raw.task.findUnique({ where: { id: taskId } });
    const owned = this.db.assertOwned(task);
    if (!owned) throw new NotFoundException('Task not found');

    const members = (await this.db.raw.member.findMany({
      where: this.db.where({ active: true }),
    })) as unknown as Member[];
    const rules = (await this.db.raw.routingRule.findMany({
      where: this.db.where(),
    })) as unknown as RoutingRule[];

    const draft: TaskDraft = {
      title: owned.title,
      description: owned.description ?? undefined,
      dueAt: owned.dueAt ? owned.dueAt.toISOString() : undefined,
      urgency: owned.urgency,
      category: owned.category,
      requiredSkills: owned.requiredSkills,
      minAge: owned.minAge ?? undefined,
      maxAge: owned.maxAge ?? undefined,
      requiresApproval: owned.requiresApproval,
    };

    const decision = routeTask({
      task: draft,
      members: members.map((m) => isoify(m)),
      rules: rules.map((r) => isoify(r)),
      now: new Date(),
    });

    if (decision.assignedMemberId) {
      await this.db.raw.task.update({
        where: { id: taskId },
        data: { assignedMemberId: decision.assignedMemberId, status: 'ASSIGNED' },
      });
    }
    return decision;
  }

  async assign(taskId: string, memberId: string) {
    await this.get(taskId);
    // Ensure the member is in this household.
    const member = await this.db.raw.member.findUnique({ where: { id: memberId } });
    if (!this.db.assertOwned(member)) {
      throw new NotFoundException('Member not found in household');
    }
    const row = await this.db.raw.task.update({
      where: { id: taskId },
      data: { assignedMemberId: memberId, status: 'ASSIGNED' },
    });
    return isoify(row);
  }

  /**
   * Drop a task: the assignee declines. The task is released (status DROPPED,
   * assignee cleared) and an EscalationEvent is opened so a backup can claim it.
   */
  async drop(taskId: string, memberId: string, reason?: string) {
    const task = await this.get(taskId);

    const updated = await this.db.raw.task.update({
      where: { id: taskId },
      data: { status: 'DROPPED', assignedMemberId: null },
    });

    // Open an escalation window (broadcast eligibility) for the dropped task.
    const deadline = task.dueAt
      ? new Date(task.dueAt)
      : new Date(Date.now() + 60 * 60 * 1000);
    const escalation = await this.db.raw.escalationEvent.create({
      data: this.db.data({
        taskId,
        tier: 0,
        deadline,
      }) as Prisma.EscalationEventUncheckedCreateInput,
    });

    return {
      task: isoify(updated),
      escalationId: escalation.id,
      droppedBy: memberId,
      reason: reason ?? null,
    };
  }

  /**
   * Claim a dropped/escalated task. Delegates the lock decision to the core
   * escalation engine; the claim is idempotent (a second claim is a no-op).
   */
  async claim(taskId: string, memberId: string) {
    const task = await this.get(taskId);

    // Ensure the claimer belongs to this household.
    const member = await this.db.raw.member.findUnique({ where: { id: memberId } });
    if (!this.db.assertOwned(member)) {
      throw new NotFoundException('Member not found in household');
    }

    // A task already locked (CLAIMED/DONE) cannot be re-claimed.
    if (task.status === 'CLAIMED' || task.status === 'DONE') {
      return {
        ok: false,
        task,
        reason: `Task already ${task.status} — claim ignored (idempotent lock).`,
      };
    }

    // Find the most recent open escalation for this task.
    const escalation = await this.db.raw.escalationEvent.findFirst({
      where: this.db.where({ taskId, resolvedAt: null }),
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    if (!escalation) {
      // No open escalation: claim directly (defensive path).
      const row = await this.db.raw.task.update({
        where: { id: taskId },
        data: { status: 'CLAIMED', assignedMemberId: memberId },
      });
      return { ok: true, task: isoify(row), reason: 'Claimed (no escalation).' };
    }

    const result = claimEscalation(
      {
        householdId: this.db.householdId,
        taskId,
        tier: escalation.tier,
        deadline: escalation.deadline.toISOString(),
        claimedById: escalation.claimedById ?? undefined,
        resolvedAt: escalation.resolvedAt
          ? escalation.resolvedAt.toISOString()
          : undefined,
      },
      memberId,
      now,
    );

    if (!result.ok) {
      const current = await this.db.raw.task.findUnique({ where: { id: taskId } });
      return { ok: false, task: isoify(current), reason: result.reason };
    }

    await this.db.raw.escalationEvent.update({
      where: { id: escalation.id },
      data: { claimedById: memberId, resolvedAt: now },
    });
    const row = await this.db.raw.task.update({
      where: { id: taskId },
      data: result.taskPatch,
    });
    return { ok: true, task: isoify(row), reason: result.reason };
  }

  async setStatus(taskId: string, status: string) {
    await this.get(taskId);
    const row = await this.db.raw.task.update({
      where: { id: taskId },
      data: { status: status as never },
    });
    return isoify(row);
  }
}
