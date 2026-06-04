import { Module } from '@nestjs/common';

import { EscalationController } from './escalation.controller.js';
import { EscalationService } from './escalation.service.js';

@Module({
  controllers: [EscalationController],
  providers: [EscalationService],
  exports: [EscalationService],
})
export class EscalationModule {}
