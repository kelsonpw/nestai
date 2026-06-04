import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import {
  SeasonalService,
  type CreateSeasonalInput,
} from './seasonal.service.js';

@Controller('seasonal')
@UseGuards(HouseholdGuard)
export class SeasonalController {
  constructor(private readonly service: SeasonalService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: CreateSeasonalInput) {
    return this.service.create(body);
  }
}
