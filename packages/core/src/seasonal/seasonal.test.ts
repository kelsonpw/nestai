import { describe, it, expect } from 'vitest';
import type { SeasonalProject, RegistrationTimeline } from '@nestai/contracts';
import {
  computeMilestones,
  classifySeasonalIntent,
  resolveGoalDate,
  MILESTONE_STAGE_ORDER,
} from './seasonal.js';

const NOW = '2026-06-04T12:00:00.000Z';

function project(over: Partial<SeasonalProject> = {}): SeasonalProject {
  return {
    id: 'sp-1',
    householdId: 'h-1',
    kind: 'CAMPSITE',
    status: 'CONFIRMED',
    title: 'Yosemite fall trip',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('classifySeasonalIntent', () => {
  it('classifies "take the kids to Yosemite this fall" as seasonal CAMPSITE', () => {
    const intent = classifySeasonalIntent('take the kids to Yosemite this fall');
    expect(intent.isSeasonal).toBe(true);
    expect(intent.kind).toBe('CAMPSITE');
    expect(intent.matched).toContain('yosemite');
  });

  it('classifies a ski trip', () => {
    const intent = classifySeasonalIntent('book a ski trip next season');
    expect(intent.isSeasonal).toBe(true);
    expect(intent.kind).toBe('SKI_TRIP');
  });

  it('returns not-seasonal for plain text', () => {
    const intent = classifySeasonalIntent('please take out the trash');
    expect(intent.isSeasonal).toBe(false);
    expect(intent.confidence).toBe(0);
  });
});

describe('computeMilestones', () => {
  it('computes the four staged milestones relative to the goal date', () => {
    const p = project({
      targetWindow: { start: '2026-10-01T09:00:00.000Z', end: '2026-10-05T17:00:00.000Z' },
    });
    const milestones = computeMilestones({ project: p, now: NOW });
    expect(milestones.map((m) => m.stage)).toEqual(MILESTONE_STAGE_ORDER);

    const goal = new Date('2026-10-01T09:00:00.000Z').getTime();
    const prep = new Date(milestones[0].fireAt).getTime();
    const days = (goal - prep) / 86_400_000;
    expect(days).toBeCloseTo(30, 1);

    const jit = new Date(milestones[3].fireAt).getTime();
    expect((goal - jit) / 60_000).toBeCloseTo(15, 1);

    expect(milestones[0].content).toMatch(/30-day prep/);
  });

  it('resolves goal date from a timeline opensRule', () => {
    const timeline: RegistrationTimeline = {
      id: 't-1',
      householdId: 'h-1',
      kind: 'CAMPSITE',
      label: 'Yosemite reservations',
      opensRule: 'September 15',
      leadDays: 30,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const goal = resolveGoalDate({ project: project(), timeline, now: NOW });
    expect(goal.getUTCMonth()).toBe(8); // September
    expect(goal.getUTCDate()).toBe(15);
  });
});
