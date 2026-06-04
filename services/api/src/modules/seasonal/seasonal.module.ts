import { Module } from '@nestjs/common';

import { SeasonalController } from './seasonal.controller.js';
import { SeasonalService } from './seasonal.service.js';

@Module({
  controllers: [SeasonalController],
  providers: [SeasonalService],
})
export class SeasonalModule {}
