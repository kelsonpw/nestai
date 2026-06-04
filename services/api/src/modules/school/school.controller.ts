import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import { SchoolService, type SchoolUploadInput } from './school.service.js';

@Controller('school')
@UseGuards(HouseholdGuard)
export class SchoolController {
  constructor(private readonly service: SchoolService) {}

  @Post('documents')
  upload(@Body() body: SchoolUploadInput) {
    return this.service.processDocument(body);
  }

  @Get('tasks')
  tasks() {
    return this.service.listSchoolTasks();
  }
}
