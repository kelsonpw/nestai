import { describe, it, expect } from 'vitest';
import type { Member, AvailabilityBlock } from '@nestai/contracts';
import {
  classifyUrgencyCascade,
  selectBackup,
  claim,
  reject,
  decideCriticalOverride,
  type EscalationState,
} from './escalation.js';

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

function state(over: Partial<EscalationState> = {}): EscalationState {
  return {
    householdId: 'h-1',
    taskId: 't-1',
    tier: 0,
    deadline: '2026-06-04T15:00:00.000Z',
    ...over,
  };
}

describe('classifyUrgencyCascade', () => {
  it('offers for LOW and broadcasts for HIGH', () => {
    expect(classifyUrgencyCascade('LOW').mode).toBe('OFFER');
    expect(classifyUrgencyCascade('HIGH').mode).toBe('BROADCAST');
    expect(classifyUrgencyCascade('CRITICAL').mode).toBe('BROADCAST');
  });
});

describe('selectBackup', () => {
  const windowStart = '2026-06-04T14:00:00.000Z';
  const windowEnd = '2026-06-04T15:00:00.000Z';

  it('picks an eligible adult with a cleared schedule and driving privileges', () => {
    const a = member({ id: 'a', drivingPrivileges: true, commuteMinutes: 10 });
    const b = member({ id: 'b', drivingPrivileges: true, commuteMinutes: 50 });
    const res = selectBackup({
      members: [a, b],
      windowStart,
      windowEnd,
      requiresDriving: true,
    });
    expect(res.selected?.id).toBe('a'); // shorter commute wins
  });

  it('rules out a member whose busy block overlaps the window', () => {
    const a = member({ id: 'a' });
    const busy: AvailabilityBlock = {
      id: 'ab',
      householdId: 'h-1',
      memberId: 'a',
      kind: 'BUSY',
      startsAt: '2026-06-04T14:30:00.000Z',
      endsAt: '2026-06-04T16:00:00.000Z',
      source: 'NL_TEXT',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const res = selectBackup({ members: [a], windowStart, windowEnd, availability: [busy] });
    expect(res.selected).toBeNull();
  });

  it('excludes dependents', () => {
    const kid = member({ id: 'kid', role: 'DEPENDENT' });
    const res = selectBackup({ members: [kid], windowStart, windowEnd });
    expect(res.selected).toBeNull();
  });
});

describe('claim / reject / lock', () => {
  it('reject escalates the tier and marks the member BUSY; then a claim locks it', () => {
    let ev = state();
    const r = reject(ev, 'a');
    expect(r.ok).toBe(true);
    expect(r.memberPatch.availabilityState).toBe('BUSY');
    expect(r.event.tier).toBe(1);
    ev = r.event;

    const c = claim(ev, 'b', NOW);
    expect(c.ok).toBe(true);
    expect(c.taskPatch.status).toBe('CLAIMED');
    expect(c.taskPatch.assignedMemberId).toBe('b');
    ev = c.event;

    // A second claim is a no-op (locked).
    const c2 = claim(ev, 'd', NOW);
    expect(c2.ok).toBe(false);
  });
});

describe('decideCriticalOverride', () => {
  it('overrides when unclaimed within 20 minutes of the deadline', () => {
    const ev = state({ deadline: '2026-06-04T12:10:00.000Z' });
    const d = decideCriticalOverride(ev, NOW);
    expect(d.override).toBe(true);
    expect(d.minutesToDeadline).toBe(10);
  });

  it('does not override when comfortably before the deadline', () => {
    const ev = state({ deadline: '2026-06-04T15:00:00.000Z' });
    expect(decideCriticalOverride(ev, NOW).override).toBe(false);
  });

  it('does not override an already-claimed event', () => {
    const ev = state({ deadline: '2026-06-04T12:05:00.000Z', claimedById: 'a' });
    expect(decideCriticalOverride(ev, NOW).override).toBe(false);
  });
});
