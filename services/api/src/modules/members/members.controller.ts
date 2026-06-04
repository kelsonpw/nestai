import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { HouseholdGuard } from '../../tenant/household.guard.js';
import {
  MembersService,
  type CreateMemberInput,
  type UpdateMemberInput,
} from './members.service.js';

@Controller('members')
@UseGuards(HouseholdGuard)
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: CreateMemberInput) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateMemberInput) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
