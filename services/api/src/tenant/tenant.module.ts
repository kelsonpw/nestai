import { Global, Module } from '@nestjs/common';

import { TenantContext } from './tenant-context.js';
import { TenantPrisma } from './tenant-prisma.js';
import { HouseholdGuard } from './household.guard.js';

/**
 * Provides the request-scoped tenant primitives globally so every feature
 * module can inject {@link TenantPrisma} / {@link TenantContext} and apply the
 * {@link HouseholdGuard}.
 */
@Global()
@Module({
  providers: [TenantContext, TenantPrisma, HouseholdGuard],
  exports: [TenantContext, TenantPrisma, HouseholdGuard],
})
export class TenantModule {}
