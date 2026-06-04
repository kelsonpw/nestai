import { Injectable, Scope } from '@nestjs/common';

/**
 * Request-scoped holder of the resolved tenant (householdId).
 *
 * AUTH IS A STUB FOR THE MVP: the household is taken from the `x-household-id`
 * header by {@link HouseholdGuard}. In production this would be derived from an
 * authenticated session / JWT claim instead.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private _householdId: string | null = null;

  set householdId(id: string) {
    this._householdId = id;
  }

  /** The resolved household id; throws if accessed before the guard ran. */
  get householdId(): string {
    if (!this._householdId) {
      throw new Error(
        'TenantContext.householdId accessed before HouseholdGuard resolved it.',
      );
    }
    return this._householdId;
  }

  get resolved(): boolean {
    return this._householdId != null;
  }
}
