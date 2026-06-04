import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(HouseholdGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  /** Build (preview) a member's daily digest without sending. */
  @Get('digest/:memberId')
  buildDigest(@Param('memberId') memberId: string) {
    return this.service.buildDigest(memberId);
  }

  /** Build + send a member's digest via the email provider. */
  @Post('digest/:memberId/send')
  sendDigest(@Param('memberId') memberId: string) {
    return this.service.sendDigest(memberId);
  }

  /** Build digests for the whole household. */
  @Get('digest')
  buildHousehold() {
    return this.service.buildHouseholdDigests();
  }
}
