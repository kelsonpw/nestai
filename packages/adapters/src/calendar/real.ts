/**
 * RealCalendarProvider — CalDAV / Google Calendar skeleton.
 *
 * This compiles but is intentionally inert: without configured credentials it
 * throws a clear, actionable error. Wire a CalDAV client or the Google
 * Calendar API into the marked spots to make it live.
 */
import type { CalendarProvider, Event, TimeWindow } from '@nestai/contracts';

export interface RealCalendarConfig {
  provider?: 'caldav' | 'google';
  /** CalDAV server URL or Google API base. */
  baseUrl?: string;
  /** OAuth token / app password — absent in this skeleton. */
  apiKey?: string;
  calendarId?: string;
}

export class RealCalendarProvider implements CalendarProvider {
  private readonly config: RealCalendarConfig;

  constructor(config: RealCalendarConfig = {}) {
    this.config = config;
  }

  private assertConfigured(): void {
    if (!this.config.apiKey || !this.config.baseUrl) {
      throw new Error(
        'RealCalendarProvider is not configured. Provide { baseUrl, apiKey, calendarId } ' +
          'for a CalDAV/Google calendar, or use PROVIDER_MODE=mock for local development.',
      );
    }
  }

  async listEvents(_range: TimeWindow): Promise<Event[]> {
    this.assertConfigured();
    // TODO: issue a CalDAV REPORT (time-range filter) or Google
    // events.list({ timeMin, timeMax }) and map results onto Event[].
    throw new Error('RealCalendarProvider.listEvents is not implemented yet.');
  }

  async pushEvent(_e: Event): Promise<{ externalId: string }> {
    this.assertConfigured();
    // TODO: PUT a VEVENT via CalDAV or call Google events.insert; return the
    // provider-side id for sync de-duplication.
    throw new Error('RealCalendarProvider.pushEvent is not implemented yet.');
  }
}
