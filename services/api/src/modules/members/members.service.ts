import { Injectable, NotFoundException } from '@nestjs/common';
import { computeAge } from '@nestai/core';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

export interface CreateMemberInput {
  displayName: string;
  role: 'HEAD' | 'DEPENDENT' | 'THIRD_PARTY';
  birthDate?: string;
  skills?: string[];
  drivingPrivileges?: boolean;
  homeLocation?: unknown;
  officeLocation?: unknown;
  commuteMinutes?: number;
  availabilityState?: 'AVAILABLE' | 'BUSY' | 'TRAVEL';
  contactEmail?: string;
  contactPhone?: string;
  messagingHandle?: string;
  active?: boolean;
}

export type UpdateMemberInput = Partial<CreateMemberInput>;

@Injectable()
export class MembersService {
  constructor(private readonly db: TenantPrisma) {}

  async list() {
    const rows = await this.db.raw.member.findMany({
      where: this.db.where(),
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => this.withAge(m));
  }

  async get(id: string) {
    const row = await this.db.raw.member.findUnique({ where: { id } });
    const owned = this.db.assertOwned(row);
    if (!owned) throw new NotFoundException('Member not found');
    return this.withAge(owned);
  }

  async create(input: CreateMemberInput) {
    const row = await this.db.raw.member.create({
      data: this.db.data(input) as Prisma.MemberUncheckedCreateInput,
    });
    return this.withAge(row);
  }

  async update(id: string, input: UpdateMemberInput) {
    await this.get(id); // ownership assertion (404 if foreign)
    const row = await this.db.raw.member.update({
      where: { id },
      data: input as Prisma.MemberUncheckedUpdateInput,
    });
    return this.withAge(row);
  }

  async remove(id: string) {
    await this.get(id);
    await this.db.raw.member.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Attach a derived `age` (from birthDate) alongside the serialized row. */
  private withAge(row: { birthDate: string | null } & Record<string, unknown>) {
    const age =
      row.birthDate != null
        ? computeAge(row.birthDate, new Date())
        : undefined;
    return { ...isoify(row), age };
  }
}
