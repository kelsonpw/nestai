import { Controller, Get } from '@nestjs/common';

/** Unauthenticated liveness probe (no tenant required). */
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'nestai-api', time: new Date().toISOString() };
  }
}
