import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import { EventsService, type CreateEventInput } from './events.service.js';

@Controller('events')
@UseGuards(HouseholdGuard)
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: CreateEventInput) {
    return this.service.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
