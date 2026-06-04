import { describe, it, expect } from 'vitest';
import type { SeasonalProject, HouseholdAsset, Member } from '@nestai/contracts';
import {
  generateAssetDependencyTasks,
  generateChildGearAuditTasks,
  generateDependencyChain,
} from './dependencies.js';

const NOW = '2026-06-04T12:00:00.000Z';

function skiTrip(): SeasonalProject {
  return {
    id: 'sp-1',
    householdId: 'h-1',
    kind: 'SKI_TRIP',
    status: 'CONFIRMED',
    title: 'Tahoe ski weekend',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function vehicle(name: string, attrs: Record<string, unknown> = {}): HouseholdAsset {
  return {
    id: 'a-veh',
    householdId: 'h-1',
    kind: 'VEHICLE',
    name,
    attrs: attrs as never,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function dependent(over: Partial<Member>): Member {
  return {
    id: 'kid-1',
    householdId: 'h-1',
    displayName: 'Sam',
    role: 'DEPENDENT',
    skills: [],
    drivingPrivileges: false,
    availabilityState: 'AVAILABLE',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('generateAssetDependencyTasks', () => {
  it('emits a tire-chain dependency task for a ski trip with a Honda Pilot', () => {
    const pilot = vehicle('Honda Pilot', { year: 2019, make: 'Honda', model: 'Pilot' });
    const tasks = generateAssetDependencyTasks({ project: skiTrip(), assets: [pilot] });
    expect(tasks.length).toBe(1);
    expect(tasks[0].task.title).toMatch(/tire chains fit the 2019 Honda Pilot/);
    expect(tasks[0].edge.dependsOnAssetId).toBe('a-veh');
    expect(tasks[0].task.category).toBe('SEASONAL');
  });
});

describe('generateChildGearAuditTasks', () => {
  it('audits gear for a young dependent and skips a grown one', () => {
    const young = dependent({ id: 'kid-young', displayName: 'Sam', birthDate: '2017-01-01' });
    const grown = dependent({ id: 'kid-grown', displayName: 'Alex', birthDate: '2006-01-01' });
    const tasks = generateChildGearAuditTasks({
      project: skiTrip(),
      members: [young, grown],
      now: NOW,
    });
    expect(tasks.length).toBe(1);
    expect(tasks[0].edge.dependsOnChildId).toBe('kid-young');
    expect(tasks[0].task.title).toMatch(/Sam/);
  });
});

describe('generateDependencyChain', () => {
  it('combines asset checks and child gear audits', () => {
    const pilot = vehicle('Honda Pilot', { year: 2019, make: 'Honda', model: 'Pilot' });
    const kid = dependent({ id: 'kid-young', birthDate: '2017-01-01' });
    const chain = generateDependencyChain({
      project: skiTrip(),
      assets: [pilot],
      members: [kid],
      now: NOW,
    });
    expect(chain.some((t) => t.edge.dependsOnAssetId)).toBe(true);
    expect(chain.some((t) => t.edge.dependsOnChildId)).toBe(true);
  });
});
