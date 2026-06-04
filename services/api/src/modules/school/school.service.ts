import { Inject, Injectable } from '@nestjs/common';
import type { OcrProvider } from '@nestai/contracts';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { OCR_PROVIDER } from '../../tokens.js';
import { isoify } from '../../common/serialize.js';
import { ApprovalsService } from '../approvals/approvals.service.js';
import { TasksService } from '../tasks/tasks.service.js';

export interface SchoolUploadInput {
  /** A URL or data ref to the document (mock OCR reads fixtures). */
  url?: string;
  mimeType?: string;
  /** Member who is responsible / requesting (defaults to first HEAD). */
  requestedById?: string;
}

const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2})|((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?)\b/gi;
const FEE_RE = /(?:\$\s?\d+(?:[.,]\d+)?)|(\bfee\b)|(\bpayment\b)|(\bcost\b)/i;
const PERMISSION_RE = /permission\s+slip|consent\s+form|sign(?:ed)?\s+and\s+return/i;

/**
 * School-document pipeline: OCR a document, flag permission-slip / fee / dates,
 * create a task for follow-up and an Approval gate when a slip/fee is detected.
 */
@Injectable()
export class SchoolService {
  constructor(
    private readonly db: TenantPrisma,
    private readonly approvals: ApprovalsService,
    private readonly tasks: TasksService,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
  ) {}

  async processDocument(input: SchoolUploadInput) {
    const { text } = await this.ocr.extract({
      url: input.url,
      mimeType: input.mimeType ?? 'application/pdf',
    });

    const dates = this.extractDates(text);
    const hasFee = FEE_RE.test(text);
    const hasPermissionSlip = PERMISSION_RE.test(text);

    const requestedById = await this.resolveRequester(input.requestedById);

    // Create a SCHOOL task to track the document follow-up.
    const taskResult = await this.tasks.create({
      title: hasPermissionSlip
        ? 'Sign & return school permission slip'
        : 'Review school document',
      description: text.slice(0, 280),
      category: 'SCHOOL',
      urgency: hasPermissionSlip || hasFee ? 'HIGH' : 'MED',
      dueAt: dates[0],
      requiresApproval: hasPermissionSlip || hasFee,
      noRoute: false,
    });
    const taskId = taskResult.task?.id as string | undefined;

    // Open approval gates for the flagged reasons.
    const createdApprovals: string[] = [];
    if (taskId && requestedById && hasPermissionSlip) {
      const a = await this.approvals.create({
        taskId,
        requestedById,
        reason: 'PERMISSION_SLIP',
      });
      createdApprovals.push(a.id as string);
    }
    if (taskId && requestedById && hasFee) {
      const a = await this.approvals.create({
        taskId,
        requestedById,
        reason: 'FEE',
        amount: this.extractFeeAmount(text),
      });
      createdApprovals.push(a.id as string);
    }

    return {
      ocrTextPreview: text.slice(0, 200),
      flags: { hasPermissionSlip, hasFee },
      dates,
      taskId: taskId ?? null,
      approvalIds: createdApprovals,
    };
  }

  private extractDates(text: string): string[] {
    const out = new Set<string>();
    for (const m of text.matchAll(DATE_RE)) {
      const raw = m[0];
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw);
      if (!Number.isNaN(d.getTime())) out.add(d.toISOString());
    }
    return [...out];
  }

  private extractFeeAmount(text: string): number | undefined {
    const m = /\$\s?(\d+(?:[.,]\d+)?)/.exec(text);
    if (!m) return undefined;
    const n = Number(m[1]!.replace(',', ''));
    return Number.isFinite(n) ? n : undefined;
  }

  private async resolveRequester(explicit?: string): Promise<string | undefined> {
    if (explicit) return explicit;
    const head = await this.db.raw.member.findFirst({
      where: this.db.where({ role: 'HEAD' as const }),
      orderBy: { createdAt: 'asc' },
    });
    return head?.id;
  }

  async listSchoolTasks() {
    const rows = await this.db.raw.task.findMany({
      where: this.db.where({ category: 'SCHOOL' as const }),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((t) => isoify(t));
  }
}
