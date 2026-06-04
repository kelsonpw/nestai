import { Controller, Get, Headers, Post, Body } from '@nestjs/common';

/**
 * Auth STUB for the MVP.
 *
 * There is no real authentication: a "session" is simply an `x-household-id`
 * header echoed back here so the dashboard can confirm which tenant it is acting
 * as. {@link HouseholdGuard} reads the same header on protected routes.
 */
@Controller('auth')
export class AuthController {
  /** Returns the household the caller is currently acting as (from the header). */
  @Get('whoami')
  whoami(@Headers('x-household-id') householdId?: string) {
    return {
      authenticated: Boolean(householdId),
      householdId: householdId ?? null,
      note: 'Auth is a header-based stub for the MVP (x-household-id).',
    };
  }

  /** Stub "login": echoes a session referencing the requested household. */
  @Post('login')
  login(@Body() body: { householdId?: string }) {
    return {
      householdId: body?.householdId ?? null,
      token: body?.householdId ? `stub-session-${body.householdId}` : null,
      note: 'Stub session. Send the household id as x-household-id on requests.',
    };
  }
}
