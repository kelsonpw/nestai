import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { SchoolController } from './school.controller.js';
import { SchoolService } from './school.service.js';

@Module({
  imports: [ApprovalsModule, TasksModule],
  controllers: [SchoolController],
  providers: [SchoolService],
})
export class SchoolModule {}
