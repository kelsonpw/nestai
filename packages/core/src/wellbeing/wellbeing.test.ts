import { describe, it, expect } from 'vitest';
import type { Member, WellnessGoal, WellnessWindow, Task } from '@nestai/contracts';
import {
  findMicroWindows,
  computeBalanceBattery,
  computeLoadEquity,
} from './wellbeing.js';

const NOW = '2026-06-04T12:00:00.000Z';

function member(over: Partial<Member>): Member {
  return {
    id: 'm',
    householdId: 'h-1',
    displayName: 'M',
    role: 'HEAD',
    skills: [],
    drivingPrivileges: true,
    availabilityState: 'AVAILABLE',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function goal(over: Partial<WellnessGoal>): WellnessGoal {
  return {
    id: 'g',
    householdId: 'h-1',
    memberId: 'm',
    kind: 'GYM',
    targetCount: 3,
    durationMin: 30,
    period: 'WEEKLY',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function task(over: Partial<Task>): Task {
  return {
    id: 't',
    householdId: 'h-1',
    title: 'Drive',
    urgency: 'MED',
    status: 'ASSIGNED',
    category: 'LOGISTICS',
    requiredSkills: [],
    requiresApproval: false,
    confidence: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('findMicroWindows', () => {
  it('proposes a gym micro-window adjacent to a drop-off', () => {
    const m = member({ id: 'm' });
    const g = goal({ id: 'gym', memberId: 'm', kind: 'GYM', durationMin: 30 });
    const windows = findMicroWindows({
      member: m,
      goals: [g],
      busy: [
        { startsAt: '2026-06-04T08:00:00.000Z', endsAt: '2026-06-04T08:30:00.000Z', label: 'school drop-off' },
      ],
      rangeStart: '2026-06-04T08:30:00.000Z',
      rangeEnd: '2026-06-04T10:00:00.000Z',
      now: NOW,
    });
    expect(windows.length).toBe(1);
    expect(windows[0].goalId).toBe('gym');
    expect(windows[0].status).toBe('SUGGESTED');
    // 30 minutes long.
    const dur =
      (new Date(windows[0].endsAt).getTime() - new Date(windows[0].startsAt).getTime()) / 60_000;
    expect(dur).toBe(30);
  });

  it('finds no window when the gap is too small', () => {
    const m = member({ id: 'm' });
    const g = goal({ id: 'gym', memberId: 'm', durationMin: 60 });
    const windows = findMicroWindows({
      member: m,
      goals: [g],
      busy: [],
      rangeStart: '2026-06-04T09:00:00.000Z',
      rangeEnd: '2026-06-04T09:30:00.000Z',
      now: NOW,
    });
    expect(windows.length).toBe(0);
  });
});

describe('computeBalanceBattery', () => {
  it('computes goal completion percentage from claimed windows', () => {
    const m = member({ id: 'm' });
    const g = goal({ id: 'g', memberId: 'm', targetCount: 4 });
    const windows: WellnessWindow[] = [1, 2].map((i) => ({
      id: `w${i}`,
      householdId: 'h-1',
      memberId: 'm',
      goalId: 'g',
      startsAt: NOW,
      endsAt: NOW,
      status: 'CLAIMED',
      createdAt: NOW,
      updatedAt: NOW,
    }));
    const battery = computeBalanceBattery({ member: m, goals: [g], windows });
    expect(battery.goalCompletionPct).toBe(50); // 2 of 4
  });

  it('is 100% when the member has no goals', () => {
    const m = member({ id: 'm' });
    const battery = computeBalanceBattery({ member: m, goals: [], windows: [] });
    expect(battery.goalCompletionPct).toBe(100);
  });
});

describe('computeLoadEquity', () => {
  it('attributes weighted load shares across members', () => {
    const a = member({ id: 'a' });
    const b = member({ id: 'b' });
    const tasks = [
      task({ id: 't1', assignedMemberId: 'a', urgency: 'MED', category: 'LOGISTICS' }), // weight 2
      task({ id: 't2', assignedMemberId: 'a', urgency: 'MED', category: 'SCHOOL' }), // weight 2
      task({ id: 't3', assignedMemberId: 'b', urgency: 'MED', category: 'ERRAND' }), // weight 2
    ];
    const equity = computeLoadEquity({ members: [a, b], tasks });
    const aShare = equity.find((e) => e.memberId === 'a')!;
    const bShare = equity.find((e) => e.memberId === 'b')!;
    expect(aShare.sharePct).toBeCloseTo(66.7, 1);
    expect(bShare.sharePct).toBeCloseTo(33.3, 1);
  });

  it('returns zero shares when there are no logistics tasks', () => {
    const a = member({ id: 'a' });
    const equity = computeLoadEquity({ members: [a], tasks: [] });
    expect(equity[0].sharePct).toBe(0);
    expect(equity[0].taskLoad).toBe(0);
  });
});
