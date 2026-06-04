import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApprovalDecisionRequestSchema,
  type ApprovalDecisionRequest,
} from '@nestai/contracts';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  ApprovalsService,
  type CreateApprovalInput,
} from './approvals.service.js';

@Controller('approvals')
@UseGuards(HouseholdGuard)
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Post()
  create(@Body() body: CreateApprovalInput) {
    return this.service.create(body);
  }

  @Post('decision')
  decide(
    @Body(new ZodValidationPipe(ApprovalDecisionRequestSchema))
    body: ApprovalDecisionRequest,
  ) {
    return this.service.decide(body.approvalId, body.decidedById, body.decision);
  }
}
