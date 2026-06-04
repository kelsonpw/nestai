import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import {
  HouseholdService,
  type UpdateHouseholdInput,
} from './household.service.js';

@Controller('household')
@UseGuards(HouseholdGuard)
export class HouseholdController {
  constructor(private readonly service: HouseholdService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@Body() body: UpdateHouseholdInput) {
    return this.service.update(body);
  }
}
