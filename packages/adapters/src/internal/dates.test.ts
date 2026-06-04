import { describe, it, expect } from 'vitest';
import { parseClockTime, parseRelativeDate } from './dates.js';

// Reference "now": Thursday 2026-06-04T12:00:00Z.
const NOW = '2026-06-04T12:00:00.000Z';

describe('parseClockTime', () => {
  it('parses 12h am/pm', () => {
    expect(parseClockTime('meet at 5pm')).toEqual({ hour: 17, minute: 0 });
    expect(parseClockTime('at 5:30pm')).toEqual({ hour: 17, minute: 30 });
    expect(parseClockTime('9 am sharp')).toEqual({ hour: 9, minute: 0 });
    expect(parseClockTime('12am')).toEqual({ hour: 0, minute: 0 });
    expect(parseClockTime('12pm')).toEqual({ hour: 12, minute: 0 });
  });

  it('parses 24h', () => {
    expect(parseClockTime('17:00')).toEqual({ hour: 17, minute: 0 });
  });

  it('returns null with no time', () => {
    expect(parseClockTime('sometime soon')).toBeNull();
  });
});

describe('parseRelativeDate', () => {
  it('parses "tomorrow" with a time', () => {
    const iso = parseRelativeDate('do it tomorrow at 5pm', NOW);
    expect(iso).toBe('2026-06-05T17:00:00.000Z');
  });

  it('parses "today" defaulting to 09:00 when no time', () => {
    expect(parseRelativeDate('today', NOW)).toBe('2026-06-04T09:00:00.000Z');
  });

  it('parses "Fri 5pm" as the upcoming Friday', () => {
    // Thursday 6/4 -> Friday 6/5.
    expect(parseRelativeDate('Fri 5pm', NOW)).toBe('2026-06-05T17:00:00.000Z');
  });

  it('parses "next Friday" as the following week', () => {
    expect(parseRelativeDate('next Friday 5pm', NOW)).toBe(
      '2026-06-12T17:00:00.000Z',
    );
  });

  it('parses bare time as today', () => {
    expect(parseRelativeDate('at 3pm', NOW)).toBe('2026-06-04T15:00:00.000Z');
  });

  it('returns null when nothing matches', () => {
    expect(parseRelativeDate('whenever you can', NOW)).toBeNull();
  });
});
