import { Inject, Injectable, Scope } from '@nestjs/common';
import type { PrismaClient } from '@nestai/db';

import { PRISMA } from '../tokens.js';
import { TenantContext } from './tenant-context.js';

/**
 * A request-scoped wrapper around the singleton {@link PrismaClient} that
 * enforces multi-tenant isolation: every read is filtered by the current
 * household and every write injects the current `householdId`.
 *
 * Services should go through `where(...)` / `data(...)` (or the convenience
 * `scoped` accessor) rather than touching `prisma` directly, so a household can
 * never read or mutate another household's rows. `assertOwned` defends against
 * id-based lookups returning a foreign row.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantPrisma {
  constructor(
    @Inject(PRISMA) private readonly client: PrismaClient,
    private readonly tenant: TenantContext,
  ) {}

  /** The resolved household id for this request. */
  get householdId(): string {
    return this.tenant.householdId;
  }

  /**
   * The raw Prisma client. Prefer the scoped helpers; use this only for joins
   * where the tenant filter is applied explicitly, and always include
   * `householdId` in the `where`.
   */
  get raw(): PrismaClient {
    return this.client;
  }

  /**
   * Merge the tenant filter into a `where` clause. Typed loosely so callers can
   * pass Prisma enum filters; the household scope is always injected.
   */
  where<T extends object>(rest: T = {} as T): T & { householdId: string } {
    return { ...rest, householdId: this.tenant.householdId };
  }

  /** Inject the tenant id into a `create`/`update` data payload. */
  data<T extends object>(rest: T): T & { householdId: string } {
    return { ...rest, householdId: this.tenant.householdId };
  }

  /**
   * Assert a fetched row belongs to the current household. Returns the row when
   * valid (and non-null), otherwise null — callers map null to a 404.
   */
  assertOwned<T extends { householdId: string } | null | undefined>(
    row: T,
  ): NonNullable<T> | null {
    if (!row) return null;
    if (row.householdId !== this.tenant.householdId) return null;
    return row as NonNullable<T>;
  }
}
