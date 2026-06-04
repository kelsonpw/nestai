import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import {
  AvailabilityService,
  type AvailabilityBlockInput,
} from './availability.service.js';

@Controller('availability')
@UseGuards(HouseholdGuard)
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get()
  list(@Query('memberId') memberId?: string) {
    return this.service.list(memberId);
  }

  @Post('blocks')
  addBlocks(@Body() body: { blocks: AvailabilityBlockInput[] }) {
    return this.service.addBlocks(body.blocks ?? []);
  }

  @Post('screenshot')
  screenshot(
    @Body() body: { memberId: string; url?: string; mimeType?: string },
  ) {
    return this.service.ingestScreenshot(body);
  }

  @Post('conflicts/detect')
  detectConflicts() {
    return this.service.detectAndStoreConflicts();
  }
}
