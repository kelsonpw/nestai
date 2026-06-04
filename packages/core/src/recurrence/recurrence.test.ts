import { describe, it, expect } from 'vitest';
import {
  expandRecurrence,
  generateMaintenanceTasks,
  DEFAULT_MAINTENANCE_TEMPLATES,
} from './recurrence.js';

describe('expandRecurrence', () => {
  it('expands a weekly rule without DTSTART', () => {
    const occ = expandRecurrence('FREQ=WEEKLY;BYDAY=MO', {
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T00:00:00.000Z',
    });
    expect(occ.length).toBeGreaterThanOrEqual(4);
  });
});

describe('generateMaintenanceTasks', () => {
  it('generates HVAC filter swaps every 3 months over a year', () => {
    const hvac = DEFAULT_MAINTENANCE_TEMPLATES.find((t) => t.key === 'hvac-filter')!;
    const tasks = generateMaintenanceTasks({
      templates: [hvac],
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    });
    // Jan, Apr, Jul, Oct = 4 occurrences in the year (q3mo cadence).
    expect(tasks.length).toBe(4);
    expect(tasks[0].title).toBe('Replace HVAC filter');
    expect(tasks[0].category).toBe('MAINTENANCE');
    // ~3 months between consecutive due dates.
    const d0 = new Date(tasks[0].dueAt!).getTime();
    const d1 = new Date(tasks[1].dueAt!).getTime();
    const days = (d1 - d0) / 86_400_000;
    expect(days).toBeGreaterThan(80);
    expect(days).toBeLessThan(100);
  });

  it('returns drafts sorted by dueAt ascending', () => {
    const tasks = generateMaintenanceTasks({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    });
    const dues = tasks.map((t) => t.dueAt!);
    expect([...dues].sort()).toEqual(dues);
  });
});
