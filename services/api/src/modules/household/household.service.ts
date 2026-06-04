import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

export interface UpdateHouseholdInput {
  name?: string;
  timezone?: string;
  digestTimeLocal?: string;
  sundayCheckinTimeLocal?: string;
}

@Injectable()
export class HouseholdService {
  constructor(private readonly db: TenantPrisma) {}

  async get() {
    const row = await this.db.raw.household.findUnique({
      where: { id: this.db.householdId },
    });
    if (!row) throw new NotFoundException('Household not found');
    return isoify(row);
  }

  async update(input: UpdateHouseholdInput) {
    const existing = await this.db.raw.household.findUnique({
      where: { id: this.db.householdId },
    });
    if (!existing) throw new NotFoundException('Household not found');
    const row = await this.db.raw.household.update({
      where: { id: this.db.householdId },
      data: input,
    });
    return isoify(row);
  }
}
