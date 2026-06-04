import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import {
  WellbeingService,
  type WellnessGoalInput,
} from './wellbeing.service.js';

@Controller('wellbeing')
@UseGuards(HouseholdGuard)
export class WellbeingController {
  constructor(private readonly service: WellbeingService) {}

  @Get('goals')
  listGoals(@Query('memberId') memberId?: string) {
    return this.service.listGoals(memberId);
  }

  @Post('goals')
  setGoal(@Body() body: WellnessGoalInput) {
    return this.service.setGoal(body);
  }

  @Post('windows/suggest')
  suggest(
    @Body() body: { memberId: string; rangeStart: string; rangeEnd: string },
  ) {
    return this.service.suggestWindows(
      body.memberId,
      body.rangeStart,
      body.rangeEnd,
    );
  }

  @Get('battery/:memberId')
  battery(@Param('memberId') memberId: string) {
    return this.service.balanceBattery(memberId);
  }
}
