import { Module } from '@nestjs/common';

import { InfraModule } from './infra/infra.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { HealthController } from './health.controller.js';

import { AuthModule } from './modules/auth/auth.module.js';
import { HouseholdModule } from './modules/household/household.module.js';
import { MembersModule } from './modules/members/members.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { SchoolModule } from './modules/school/school.module.js';
import { SeasonalModule } from './modules/seasonal/seasonal.module.js';
import { EscalationModule } from './modules/escalation/escalation.module.js';
import { AvailabilityModule } from './modules/availability/availability.module.js';
import { WellbeingModule } from './modules/wellbeing/wellbeing.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';

/**
 * Composition root for the NestAI API.
 *
 * - {@link InfraModule}: singleton Prisma + provider bundle (createProviders/
 *   configFromEnv) exposed via DI tokens + the JobQueue.
 * - {@link TenantModule}: request-scoped tenant context + TenantPrisma + guard.
 * - {@link SchedulerModule}: recurring jobs on the queue.
 * - feature modules: thin controllers/services delegating to @nestai/core +
 *   @nestai/adapters.
 */
@Module({
  imports: [
    InfraModule,
    TenantModule,
    SchedulerModule,
    AuthModule,
    HouseholdModule,
    MembersModule,
    IngestionModule,
    TasksModule,
    EventsModule,
    ApprovalsModule,
    SchoolModule,
    SeasonalModule,
    EscalationModule,
    AvailabilityModule,
    WellbeingModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
