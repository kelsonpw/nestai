import { describe, it, expect } from 'vitest';
import type { MemberView, RoutingRule, TaskDraft } from '@nestai/contracts';
import { MockLlmProvider } from './mock.js';
import { ExtractionResultSchema, RoutingDecisionSchema } from '../zod-runtime.js';

const NOW = '2026-06-04T12:00:00.000Z'; // Thursday

function member(over: Partial<MemberView> & { id: string }): MemberView {
  return {
    displayName: over.id,
    role: 'DEPENDENT',
    skills: [],
    drivingPrivileges: false,
    availabilityState: 'AVAILABLE',
    ...over,
  };
}

describe('MockLlmProvider.extractTasks', () => {
  const llm = new MockLlmProvider();

  it('extracts a task with a parsed due date and detects urgency', async () => {
    const res = await llm.extractTasks({
      text: "Please return the permission slip by Fri 5pm, it's urgent.",
      familyContext: '',
      now: NOW,
    });
    expect(() => ExtractionResultSchema.parse(res)).not.toThrow();
    expect(res.tasks.length).toBeGreaterThanOrEqual(1);
    const task = res.tasks[0]!;
    expect(task.dueAt).toBe('2026-06-05T17:00:00.000Z');
    expect(task.urgency).toBe('CRITICAL');
    expect(task.category).toBe('SCHOOL');
    expect(task.requiresApproval).toBe(true);
  });

  it('recognizes "we should take the kids to X" as an event', async () => {
    const res = await llm.extractTasks({
      text: 'We should take the kids to the trampoline park tomorrow.',
      familyContext: '',
      now: NOW,
    });
    expect(res.events.length).toBeGreaterThanOrEqual(1);
    expect(res.events[0]!.title.toLowerCase()).toContain('trampoline');
  });

  it('infers the driving skill from carpool language', async () => {
    const res = await llm.extractTasks({
      text: 'Can you pick up the kids from practice at 4pm?',
      familyContext: '',
      now: NOW,
    });
    const task = res.tasks[0]!;
    expect(task.requiredSkills).toContain('driving');
  });

  it('is deterministic', async () => {
    const input = {
      text: 'Please buy milk tomorrow.',
      familyContext: 'fam',
      now: NOW,
    };
    const a = await llm.extractTasks(input);
    const b = await llm.extractTasks(input);
    expect(a).toEqual(b);
  });

  it('returns low confidence and a note when nothing is actionable', async () => {
    const res = await llm.extractTasks({
      text: 'Hope you had a great day!',
      familyContext: '',
      now: NOW,
    });
    expect(res.tasks).toHaveLength(0);
    expect(res.events).toHaveLength(0);
    expect(res.notes).toBeTruthy();
  });
});

describe('MockLlmProvider.route', () => {
  const llm = new MockLlmProvider();

  const drivingTask: TaskDraft = {
    title: 'Drive to practice',
    urgency: 'MED',
    category: 'LOGISTICS',
    requiredSkills: ['driving'],
    requiresApproval: false,
  };

  it('excludes members without driving privileges and picks a driver', async () => {
    const members = [
      member({ id: 'kid', drivingPrivileges: false }),
      member({ id: 'parent', role: 'HEAD', drivingPrivileges: true, skills: ['driving'] }),
    ];
    const res = await llm.route({ task: drivingTask, members, rules: [] });
    expect(() => RoutingDecisionSchema.parse(res)).not.toThrow();
    expect(res.assignedMemberId).toBe('parent');
    expect(res.confidence).toBeGreaterThan(0);
  });

  it('honors a matching routing rule', async () => {
    const members = [
      member({ id: 'a', drivingPrivileges: true, skills: ['driving'] }),
      member({ id: 'b', drivingPrivileges: true, skills: ['driving'] }),
    ];
    const rules: RoutingRule[] = [
      {
        id: 'r1',
        householdId: 'h1',
        name: 'B drives logistics',
        matchCategory: 'LOGISTICS',
        matchSkills: [],
        assignToMemberId: 'b',
        priority: 10,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const res = await llm.route({ task: drivingTask, members, rules });
    expect(res.assignedMemberId).toBe('b');
  });

  it('returns null assignee when no member is eligible', async () => {
    const members = [member({ id: 'kid', drivingPrivileges: false })];
    const res = await llm.route({ task: drivingTask, members, rules: [] });
    expect(res.assignedMemberId).toBeNull();
    expect(res.confidence).toBe(0);
  });
});
