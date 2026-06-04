import { Inject, Injectable } from '@nestjs/common';
import { detectConflicts, type LogisticsCommitment } from '@nestai/core';
import type { Member, OcrProvider } from '@nestai/contracts';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { OCR_PROVIDER } from '../../tokens.js';
import { isoify } from '../../common/serialize.js';

/** Raw OCR/screenshot source for availability is purged after this many hours. */
const PURGE_RAW_AFTER_HOURS = 24;

export interface AvailabilityBlockInput {
  memberId: string;
  kind: 'AVAILABLE' | 'BUSY' | 'TRAVEL';
  startsAt: string;
  endsAt: string;
  source: 'NL_TEXT' | 'SUNDAY_CHECKIN' | 'SCREENSHOT_OCR';
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly db: TenantPrisma,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
  ) {}

  async list(memberId?: string) {
    const rows = await this.db.raw.availabilityBlock.findMany({
      where: this.db.where(memberId ? { memberId } : {}),
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((b) => isoify(b));
  }

  /** Upsert availability blocks (NL text / Sunday check-in derived). */
  async addBlocks(blocks: AvailabilityBlockInput[]) {
    const created = [];
    for (const b of blocks) {
      const purgeRawAfter =
        b.source === 'SCREENSHOT_OCR' || b.source === 'NL_TEXT'
          ? new Date(Date.now() + PURGE_RAW_AFTER_HOURS * 3600 * 1000)
          : undefined;
      const row = await this.db.raw.availabilityBlock.create({
        data: this.db.data({
          memberId: b.memberId,
          kind: b.kind,
          startsAt: new Date(b.startsAt),
          endsAt: new Date(b.endsAt),
          source: b.source,
          purgeRawAfter,
        }) as Prisma.AvailabilityBlockUncheckedCreateInput,
      });
      created.push(isoify(row));
    }
    return created;
  }

  /**
   * Ingest a work-schedule screenshot: OCR → naive block extraction. The raw
   * text is not stored; blocks carry purgeRawAfter for ephemeral retention.
   */
  async ingestScreenshot(input: {
    memberId: string;
    url?: string;
    mimeType?: string;
  }) {
    const { text } = await this.ocr.extract({
      url: input.url,
      mimeType: input.mimeType ?? 'image/png',
    });
    // Best-effort: pull ISO date-time ranges "start..end" from OCR text.
    const ranges = [...text.matchAll(
      /(\d{4}-\d{2}-\d{2}T[\d:]+Z?)\s*(?:-|to|–|\.\.)\s*(\d{4}-\d{2}-\d{2}T[\d:]+Z?)/g,
    )];
    const blocks: AvailabilityBlockInput[] = ranges.map((m) => ({
      memberId: input.memberId,
      kind: 'BUSY',
      startsAt: new Date(m[1]!).toISOString(),
      endsAt: new Date(m[2]!).toISOString(),
      source: 'SCREENSHOT_OCR',
    }));
    const created = await this.addBlocks(blocks);
    return { textPreview: text.slice(0, 160), created };
  }

  /**
   * Run the core Conflict Radar over the household's busy blocks (as logistics
   * commitments) and persist the detected conflicts.
   */
  async detectAndStoreConflicts() {
    const members = (await this.db.raw.member.findMany({
      where: this.db.where({ active: true }),
    })) as unknown as Member[];
    const blocks = await this.db.raw.availabilityBlock.findMany({
      where: this.db.where(),
    });

    const commitments: LogisticsCommitment[] = blocks
      .filter((b) => b.kind !== 'AVAILABLE')
      .map((b) => ({
        memberId: b.memberId,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        requiresDriver: false,
        label: `${b.kind} block`,
      }));

    const conflicts = detectConflicts({
      commitments,
      members: members.map((m) => isoify(m)),
      now: new Date(),
    });

    const stored = [];
    for (const c of conflicts) {
      const row = await this.db.raw.conflict.create({
        data: this.db.data({
          type: c.type,
          severity: c.severity,
          description: c.description,
          mitigation: c.mitigation,
          windowStart: c.windowStart ? new Date(c.windowStart) : undefined,
          windowEnd: c.windowEnd ? new Date(c.windowEnd) : undefined,
          relatedTaskId: c.relatedTaskId,
        }) as Prisma.ConflictUncheckedCreateInput,
      });
      stored.push(isoify(row));
    }
    return stored;
  }
}
