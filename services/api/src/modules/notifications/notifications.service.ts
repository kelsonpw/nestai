import { Inject, Injectable } from '@nestjs/common';
import { computeLoadEquity } from '@nestai/core';
import {
  DigestPayloadSchema,
  type DigestPayload,
  type DigestItem,
  type Member,
  type Task,
  type EmailProvider,
  type MessagingProvider,
} from '@nestai/contracts';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { EMAIL_PROVIDER, MESSAGING_PROVIDER } from '../../tokens.js';
import { isoify } from '../../common/serialize.js';

/** Look-ahead window (hours) for items included in a daily digest. */
const DIGEST_HORIZON_HOURS = 24;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: TenantPrisma,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
  ) {}

  /**
   * Build the daily {@link DigestPayload} for one member: their assigned tasks
   * due within the horizon plus today's events, with a load-share summary.
   * Validated against the contracts Zod schema before returning.
   */
  async buildDigest(memberId: string, nowInput?: Date): Promise<DigestPayload> {
    const now = nowInput ?? new Date();
    const horizon = new Date(now.getTime() + DIGEST_HORIZON_HOURS * 3600 * 1000);

    const member = await this.db.raw.member.findUnique({
      where: { id: memberId },
    });
    const owned = this.db.assertOwned(member);
    if (!owned) {
      throw new Error('Member not found in household');
    }

    const tasks = await this.db.raw.task.findMany({
      where: this.db.where({
        assignedMemberId: memberId,
        status: { in: ['OPEN', 'ASSIGNED', 'CLAIMED'] as Task['status'][] },
      }),
      orderBy: { dueAt: 'asc' },
    });

    const events = await this.db.raw.event.findMany({
      where: this.db.where({
        startsAt: { gte: now, lte: horizon },
      }),
      orderBy: { startsAt: 'asc' },
    });

    const items: DigestItem[] = [];
    for (const t of tasks) {
      const item: DigestItem = { taskId: t.id, title: t.title, urgency: t.urgency };
      if (t.dueAt) item.when = t.dueAt.toISOString();
      if (t.description) item.note = t.description;
      items.push(item);
    }
    for (const e of events) {
      items.push({
        eventId: e.id,
        title: e.title,
        when: e.startsAt.toISOString(),
      });
    }

    // Load-share summary across the household.
    const allMembers = (await this.db.raw.member.findMany({
      where: this.db.where({ active: true }),
    })) as unknown as Member[];
    const allTasks = (await this.db.raw.task.findMany({
      where: this.db.where(),
    })) as unknown as Task[];
    const equity = computeLoadEquity({
      members: allMembers.map((m) => isoify(m)),
      tasks: allTasks.map((t) => isoify(t)),
    });
    const myShare = equity.find((e) => e.memberId === memberId)?.sharePct ?? 0;

    const payload: DigestPayload = {
      householdId: this.db.householdId,
      memberId,
      type: 'DAILY_DIGEST',
      date: now.toISOString().slice(0, 10),
      greeting: `Good morning, ${owned.displayName}.`,
      items,
      summary: `You carry ${myShare}% of the household's logistics load today. ${items.length} item(s) on your plate.`,
    };

    // Validate against the contract before returning / sending.
    return DigestPayloadSchema.parse(payload);
  }

  /**
   * Build and "send" a member's daily digest via the email provider (mock writes
   * to fixtures/_sink/email). Returns the payload + provider ref.
   */
  async sendDigest(memberId: string, nowInput?: Date) {
    const payload = await this.buildDigest(memberId, nowInput);
    const member = await this.db.raw.member.findUnique({
      where: { id: memberId },
    });
    const to = member?.contactEmail ?? `${memberId}@example.test`;

    const sent = await this.email.send({
      channel: 'EMAIL',
      to,
      subject: `Your NestAI daily digest — ${payload.date}`,
      body: this.renderDigest(payload),
    });

    // Persist a Notification record.
    const notification = await this.db.raw.notification.create({
      data: this.db.data({
        memberId,
        channel: 'EMAIL',
        type: 'DAILY_DIGEST',
        payload: payload as unknown as object,
        scheduledFor: nowInput ?? new Date(),
        sentAt: new Date(),
        status: 'SENT',
        providerRef: sent.providerRef,
      }) as never,
    });

    return { payload, providerRef: sent.providerRef, notificationId: notification.id };
  }

  /** Build digests for every active member in the household. */
  async buildHouseholdDigests(nowInput?: Date): Promise<DigestPayload[]> {
    const members = await this.db.raw.member.findMany({
      where: this.db.where({ active: true }),
    });
    const out: DigestPayload[] = [];
    for (const m of members) {
      out.push(await this.buildDigest(m.id, nowInput));
    }
    return out;
  }

  private renderDigest(payload: DigestPayload): string {
    const lines = [payload.greeting ?? '', ''];
    for (const item of payload.items) {
      const when = item.when ? ` (${item.when})` : '';
      lines.push(`- ${item.title}${when}`);
    }
    if (payload.summary) {
      lines.push('', payload.summary);
    }
    return lines.join('\n');
  }
}
