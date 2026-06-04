import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

export interface CreateEventInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: unknown;
  allDay?: boolean;
  ownerMemberId?: string;
  colorTag?: string;
}

@Injectable()
export class EventsService {
  constructor(private readonly db: TenantPrisma) {}

  async list() {
    const rows = await this.db.raw.event.findMany({
      where: this.db.where(),
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((e) => isoify(e));
  }

  async get(id: string) {
    const row = await this.db.raw.event.findUnique({ where: { id } });
    const owned = this.db.assertOwned(row);
    if (!owned) throw new NotFoundException('Event not found');
    return isoify(owned);
  }

  async create(input: CreateEventInput) {
    const row = await this.db.raw.event.create({
      data: this.db.data({
        title: input.title,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        location: input.location as Prisma.InputJsonValue,
        allDay: input.allDay ?? false,
        ownerMemberId: input.ownerMemberId,
        colorTag: input.colorTag,
      }) as Prisma.EventUncheckedCreateInput,
    });
    return isoify(row);
  }

  async remove(id: string) {
    await this.get(id);
    await this.db.raw.event.delete({ where: { id } });
    return { id, deleted: true };
  }
}
