import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import { EscalationService } from './escalation.service.js';

@Controller('escalation')
@UseGuards(HouseholdGuard)
export class EscalationController {
  constructor(private readonly service: EscalationService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post(':id/broadcast')
  broadcast(
    @Param('id') id: string,
    @Body() body: { excludeMemberIds?: string[] },
  ) {
    return this.service.broadcast(id, body?.excludeMemberIds ?? []);
  }
}
