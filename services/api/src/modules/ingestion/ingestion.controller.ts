import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  IngestMessageRequestSchema,
  type IngestMessageRequest,
} from '@nestai/contracts';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { IngestionService } from './ingestion.service.js';

@Controller('ingestion')
@UseGuards(HouseholdGuard)
export class IngestionController {
  constructor(
    private readonly service: IngestionService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Accept an inbound message (WhatsApp/email/calendar/upload). The body is
   * validated against the contracts Zod schema; `householdId` is forced to the
   * tenant resolved by the guard (the client value is ignored for safety).
   */
  @Post('message')
  ingest(@Body() raw: unknown) {
    const merged = {
      ...(raw as Record<string, unknown>),
      householdId: this.tenant.householdId,
    };
    const pipe = new ZodValidationPipe(IngestMessageRequestSchema);
    const req: IngestMessageRequest = pipe.transform(merged);
    return this.service.ingest(req);
  }

  /** Accept a raw messaging-provider webhook payload (WhatsApp/SMS). */
  @Post('webhook')
  webhook(@Body() payload: unknown) {
    return this.service.ingestWebhook(payload);
  }

  @Get('messages')
  list() {
    return this.service.listMessages();
  }
}
