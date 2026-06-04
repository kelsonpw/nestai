import { describe, it, expect } from 'vitest';
import type { Member, RoutingRule, TaskDraft } from '@nestai/contracts';
import { route } from './engine.js';
import { computeAge } from './age.js';

const NOW = '2026-06-04T12:00:00.000Z';

function member(over: Partial<Member>): Member {
  return {
    id: 'm-1',
    householdId: 'h-1',
    displayName: 'Member',
    role: 'HEAD',
    skills: [],
    drivingPrivileges: false,
    availabilityState: 'AVAILABLE',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const baseTask: TaskDraft = {
  title: 'Soccer pickup',
  urgency: 'HIGH',
  category: 'LOGISTICS',
  requiredSkills: [],
  requiresApproval: false,
};

describe('computeAge', () => {
  it('computes whole-year age', () => {
    expect(computeAge('2010-06-04', NOW)).toBe(16);
    expect(computeAge('2010-06-05', NOW)).toBe(15); // birthday tomorrow
  });
  it('returns undefined for missing/invalid', () => {
    expect(computeAge(undefined, NOW)).toBeUndefined();
    expect(computeAge('not-a-date', NOW)).toBeUndefined();
  });
});

describe('route', () => {
  it('routes a soccer pickup to a driving adult over a non-driver', () => {
    const driver = member({
      id: 'dad',
      displayName: 'Dad',
      drivingPrivileges: true,
    });
    const nonDriver = member({
      id: 'kid',
      displayName: 'Kid',
      role: 'DEPENDENT',
      drivingPrivileges: false,
      birthDate: '2012-01-01',
    });
    const decision = route({
      task: baseTask,
      members: [nonDriver, driver],
      now: NOW,
    });
    expect(decision.assignedMemberId).toBe('dad');
    expect(decision.rationale).toMatch(/driving privileges/);
  });

  it('returns null assignee when no member is eligible', () => {
    const m = member({ skills: [] });
    const decision = route({
      task: { ...baseTask, requiredSkills: ['plumbing'] },
      members: [m],
      now: NOW,
    });
    expect(decision.assignedMemberId).toBeNull();
    expect(decision.confidence).toBe(0);
  });

  it('honors a routing rule that forces an assignee', () => {
    const a = member({ id: 'a', displayName: 'A', drivingPrivileges: true });
    const b = member({ id: 'b', displayName: 'B', drivingPrivileges: true });
    const rule: RoutingRule = {
      id: 'r1',
      householdId: 'h-1',
      name: 'B drives logistics',
      matchCategory: 'LOGISTICS',
      matchSkills: [],
      assignToMemberId: 'b',
      priority: 10,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const decision = route({ task: baseTask, members: [a, b], rules: [rule], now: NOW });
    expect(decision.assignedMemberId).toBe('b');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
