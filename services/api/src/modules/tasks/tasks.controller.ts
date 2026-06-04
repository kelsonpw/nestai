import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import { TasksService, type CreateTaskInput } from './tasks.service.js';

@Controller('tasks')
@UseGuards(HouseholdGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: CreateTaskInput) {
    return this.service.create(body);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: { memberId: string }) {
    return this.service.assign(id, body.memberId);
  }

  @Post(':id/drop')
  drop(
    @Param('id') id: string,
    @Body() body: { memberId: string; reason?: string },
  ) {
    return this.service.drop(id, body.memberId, body.reason);
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @Body() body: { memberId: string }) {
    return this.service.claim(id, body.memberId);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.service.setStatus(id, body.status);
  }
}
