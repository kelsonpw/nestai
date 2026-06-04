import { describe, it, expect } from 'vitest';
import type { Event } from '@nestai/contracts';
import { MockCalendarProvider } from './mock.js';

describe('MockCalendarProvider', () => {
  const cal = new MockCalendarProvider();

  it('reads .ics fixtures within a window and maps to Event[]', async () => {
    const events = await cal.listEvents({
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-06-30T00:00:00.000Z',
    });
    expect(events.length).toBeGreaterThanOrEqual(3);
    const soccer = events.find((e) => e.title === 'Soccer practice');
    expect(soccer).toBeDefined();
    expect(soccer!.location?.label).toBe('Riverside Park Field 3');
    expect(soccer!.startsAt).toBe('2026-06-05T23:00:00.000Z');
    // sorted ascending by start
    const starts = events.map((e) => e.startsAt);
    expect([...starts].sort()).toEqual(starts);
  });

  it('filters out events outside the window', async () => {
    const events = await cal.listEvents({
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-06-06T00:00:00.000Z',
    });
    expect(events.every((e) => e.startsAt < '2026-06-06')).toBe(true);
  });

  it('pushEvent echoes a deterministic external id', async () => {
    const e: Event = {
      id: 'evt-1',
      householdId: 'h1',
      title: 'Birthday party',
      startsAt: '2026-07-01T18:00:00.000Z',
      allDay: false,
      createdAt: '2026-06-04T12:00:00.000Z',
      updatedAt: '2026-06-04T12:00:00.000Z',
    };
    const a = await cal.pushEvent(e);
    const b = await cal.pushEvent(e);
    expect(a.externalId).toBe('evt-1');
    expect(a).toEqual(b);
  });
});
