import { describe, it, expect } from 'vitest';
import type { Member } from '@nestai/contracts';
import {
  filterByCommute,
  assignByRouteSynergy,
  detectConflicts,
  type LogisticsCommitment,
} from './commute.js';

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

describe('filterByCommute', () => {
  it('rules out the 40-min-away parent for a tight pickup', () => {
    const close = member({ id: 'close', commuteMinutes: 15 });
    const far = member({ id: 'far', commuteMinutes: 40 });
    const res = filterByCommute({
      members: [close, far],
      leaveAt: '2026-06-04T15:00:00.000Z',
      pickupAt: '2026-06-04T15:30:00.000Z', // 30m budget
    });
    expect(res.feasible.map((m) => m.id)).toEqual(['close']);
    expect(res.infeasible[0].member.id).toBe('far');
  });

  it('keeps members with unknown commute info', () => {
    const m = member({ id: 'unknown', commuteMinutes: undefined });
    const res = filterByCommute({
      members: [m],
      leaveAt: '2026-06-04T15:00:00.000Z',
      pickupAt: '2026-06-04T15:05:00.000Z',
    });
    expect(res.feasible.length).toBe(1);
  });
});

describe('assignByRouteSynergy', () => {
  it('assigns drop-off to the adult whose office is on the way to school', () => {
    const onRoute = member({
      id: 'onroute',
      officeLocation: { label: 'Office A', lat: 37.4, lng: -122.1 },
    });
    const detour = member({
      id: 'detour',
      officeLocation: { label: 'Office B', lat: 38.0, lng: -123.0 },
    });
    const res = assignByRouteSynergy({
      members: [detour, onRoute],
      destination: { label: 'School', lat: 37.41, lng: -122.11 },
    });
    expect(res.assignedMemberId).toBe('onroute');
  });

  it('returns null when no eligible driver', () => {
    const kid = member({ id: 'kid', role: 'DEPENDENT', drivingPrivileges: false });
    const res = assignByRouteSynergy({
      members: [kid],
      destination: { label: 'School', lat: 1, lng: 1 },
    });
    expect(res.assignedMemberId).toBeNull();
  });
});

describe('detectConflicts', () => {
  it('detects a sole-driver conflict', () => {
    const onlyDriver = member({ id: 'solo', drivingPrivileges: true });
    const kid = member({ id: 'kid', role: 'DEPENDENT', drivingPrivileges: false });
    const commitments: LogisticsCommitment[] = [
      {
        memberId: 'solo',
        requiresDriver: true,
        startsAt: '2026-06-04T15:00:00.000Z',
        endsAt: '2026-06-04T15:30:00.000Z',
        label: 'soccer pickup',
      },
    ];
    const conflicts = detectConflicts({
      commitments,
      members: [onlyDriver, kid],
      now: NOW,
    });
    expect(conflicts.some((c) => c.type === 'SOLE_DRIVER')).toBe(true);
    const sole = conflicts.find((c) => c.type === 'SOLE_DRIVER')!;
    expect(sole.severity).toBe('HIGH');
    expect(sole.mitigation).toMatch(/backup/i);
  });

  it('detects a buffer squeeze between back-to-back commitments', () => {
    const m = member({ id: 'm', drivingPrivileges: true });
    const m2 = member({ id: 'm2', drivingPrivileges: true });
    const commitments: LogisticsCommitment[] = [
      { memberId: 'm', startsAt: '2026-06-04T15:00:00.000Z', endsAt: '2026-06-04T15:30:00.000Z', label: 'A' },
      { memberId: 'm', startsAt: '2026-06-04T15:35:00.000Z', endsAt: '2026-06-04T16:00:00.000Z', label: 'B' },
    ];
    const conflicts = detectConflicts({ commitments, members: [m, m2], now: NOW });
    expect(conflicts.some((c) => c.type === 'BUFFER_SQUEEZE')).toBe(true);
  });

  it('detects a ripple shift on overlapping same-member commitments', () => {
    const m = member({ id: 'm', drivingPrivileges: true });
    const m2 = member({ id: 'm2', drivingPrivileges: true });
    const commitments: LogisticsCommitment[] = [
      { memberId: 'm', startsAt: '2026-06-04T15:00:00.000Z', endsAt: '2026-06-04T16:00:00.000Z', label: 'A' },
      { memberId: 'm', startsAt: '2026-06-04T15:30:00.000Z', endsAt: '2026-06-04T16:30:00.000Z', label: 'B' },
    ];
    const conflicts = detectConflicts({ commitments, members: [m, m2], now: NOW });
    expect(conflicts.some((c) => c.type === 'RIPPLE_SHIFT')).toBe(true);
  });
});
