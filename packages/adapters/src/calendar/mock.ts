/**
 * MockCalendarProvider — reads `.ics` fixtures from `fixtures/calendar/` using
 * node-ical, filters VEVENTs to the requested window, and maps them onto the
 * contracts' `Event` shape. `pushEvent` is a no-op that echoes back a
 * deterministic external id (so callers can exercise the round trip without
 * network or credentials).
 */
import { readFile } from 'node:fs/promises';
import * as ical from 'node-ical';

import type { CalendarProvider, Event, TimeWindow } from '@nestai/contracts';
import { fixturePath } from '../internal/paths.js';

const DEFAULT_HOUSEHOLD = 'household-mock';

export interface MockCalendarConfig {
  /** ICS file under fixtures/, defaults to "calendar/household.ics". */
  icsRelativePath?: string;
  householdId?: string;
}

export class MockCalendarProvider implements CalendarProvider {
  private readonly icsRelativePath: string;
  private readonly householdId: string;

  constructor(config: MockCalendarConfig = {}) {
    this.icsRelativePath = config.icsRelativePath ?? 'calendar/household.ics';
    this.householdId = config.householdId ?? DEFAULT_HOUSEHOLD;
  }

  async listEvents(range: TimeWindow): Promise<Event[]> {
    const raw = await readFile(fixturePath(...this.icsRelativePath.split('/')), 'utf8');
    const parsed = ical.sync.parseICS(raw);
    const start = new Date(range.start).getTime();
    const end = new Date(range.end).getTime();

    const events: Event[] = [];
    for (const key of Object.keys(parsed)) {
      const comp = parsed[key];
      if (!comp || comp.type !== 'VEVENT') continue;
      const startsAt = new Date(comp.start);
      const startMs = startsAt.getTime();
      if (Number.isNaN(startMs)) continue;
      if (startMs < start || startMs > end) continue;

      const endsAt = comp.end ? new Date(comp.end) : undefined;
      const nowIso = new Date().toISOString();
      events.push({
        id: comp.uid || key,
        householdId: this.householdId,
        title: comp.summary || '(untitled)',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt.toISOString() : undefined,
        location: comp.location ? { label: comp.location } : undefined,
        allDay: comp.datetype === 'date',
        externalId: comp.uid || key,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return events;
  }

  async pushEvent(e: Event): Promise<{ externalId: string }> {
    // No-op echo: deterministic id derived from the event's own id/title.
    const externalId = e.externalId ?? e.id ?? `mock-${slug(e.title)}`;
    return { externalId };
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
