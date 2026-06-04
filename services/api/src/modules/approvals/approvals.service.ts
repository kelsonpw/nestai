import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { isoify } from '../../common/serialize.js';

export interface CreateApprovalInput {
  taskId: string;
  requestedById: string;
  reason: 'PERMISSION_SLIP' | 'FEE' | 'QUOTE' | 'ASSIGNMENT' | 'OTHER';
  amount?: number;
}

@Injectable()
export class ApprovalsService {
  constructor(private readonly db: TenantPrisma) {}

  async list(status?: string) {
    const rows = await this.db.raw.approval.findMany({
      where: this.db.where(status ? { status: status as never } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => isoify(a));
  }

  async create(input: CreateApprovalInput) {
    const row = await this.db.raw.approval.create({
      data: this.db.data(input) as Prisma.ApprovalUncheckedCreateInput,
    });
    return isoify(row);
  }

  /** Decide (approve/reject) an approval. Tenant-checked before mutation. */
  async decide(
    approvalId: string,
    decidedById: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    const existing = await this.db.raw.approval.findUnique({
      where: { id: approvalId },
    });
    const owned = this.db.assertOwned(existing);
    if (!owned) throw new NotFoundException('Approval not found');

    const row = await this.db.raw.approval.update({
      where: { id: approvalId },
      data: {
        status: decision,
        decidedById,
        decidedAt: new Date(),
      },
    });
    return isoify(row);
  }
}
