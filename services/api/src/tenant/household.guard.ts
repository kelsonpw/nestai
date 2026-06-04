import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { TenantContext } from './tenant-context.js';

/** Minimal structural shape of the bits of the HTTP request we read. */
interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  header?: (name: string) => string | undefined;
}

/**
 * Resolves the tenant (household) for the current request and stamps it onto the
 * request-scoped {@link TenantContext}.
 *
 * AUTH STUB: the household id is read from the `x-household-id` header. There is
 * no real authentication in the MVP — a production build would validate a
 * session/JWT and derive the household from the authenticated principal.
 */
@Injectable()
export class HouseholdGuard implements CanActivate {
  constructor(private readonly tenant: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HttpRequestLike>();
    const raw =
      req.header?.('x-household-id') ?? req.headers['x-household-id'];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header || header.trim().length === 0) {
      throw new UnauthorizedException(
        'Missing x-household-id header (auth stub). Provide a household id.',
      );
    }
    this.tenant.householdId = header.trim();
    return true;
  }
}
