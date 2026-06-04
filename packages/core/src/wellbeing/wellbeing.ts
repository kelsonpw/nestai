/**
 * Well-being.
 *
 * Pure, time-injected helpers that protect a member's personal time:
 *
 *   1. {@link findMicroWindows} — scan a member's free gaps adjacent to existing
 *      logistics commitments and propose {@link WellnessWindow}s sized to their
 *      {@link WellnessGoal}s (e.g. a 30-min gym slot tucked next to a school
 *      drop-off).
 *
 *   2. {@link computeBalanceBattery} — a member's {@link BalanceBattery}: share
 *      of wellness goals met vs. logistics load carried.
 *
 *   3. {@link computeLoadEquity} — each member's {@link LoadEquity}: their
 *      percentage share of the household's weighted logistics load.
 *
 * Nothing reaches for `Date.now()`; callers pass `now`.
 */
import type {
  Member,
  Task,
  WellnessGoal,
  WellnessWindow,
  BalanceBattery,
  LoadEquity,
  TaskUrgency,
} from '@nestai/contracts';
import { clamp, type Clock } from '../time.js';

/* -------------------------------------------------------------------------- */
/* Micro-window finder                                                          */
/* -------------------------------------------------------------------------- */

/** A busy block (existing logistics task / commitment) for a member. */
export interface BusyBlock {
  startsAt: Clock;
  endsAt: Clock;
  label?: string;
}

export type WellnessWindowDraft = Omit<
  WellnessWindow,
  'id' | 'createdAt' | 'updatedAt'
>;

export interface FindMicroWindowsInput {
  member: Member;
  goals: WellnessGoal[];
  /** Existing logistics/busy blocks for the member, any order. */
  busy: BusyBlock[];
  /** Outer scan window. */
  rangeStart: Clock;
  rangeEnd: Clock;
  /** Gap (minutes) to leave on each side of a busy block. Default 0. */
  edgeBufferMinutes?: number;
  now: Clock;
}

interface Gap {
  start: number;
  end: number;
  /** The adjacent busy block label, for messaging. */
  adjacentTo?: string;
}

/** Compute free gaps within [rangeStart, rangeEnd] around busy blocks. */
function computeGaps(input: FindMicroWindowsInput): Gap[] {
  const buffer = (input.edgeBufferMinutes ?? 0) * 60_000;
  const rangeStart = toMs(input.rangeStart);
  const rangeEnd = toMs(input.rangeEnd);

  const blocks = [...input.busy]
    .map((b) => ({
      start: toMs(b.startsAt),
      end: toMs(b.endsAt),
      label: b.label,
    }))
    .filter((b) => b.end > rangeStart && b.start < rangeEnd)
    .sort((a, b) => a.start - b.start);

  const gaps: Gap[] = [];
  let cursor = rangeStart;
  for (const b of blocks) {
    const gapEnd = b.start - buffer;
    if (gapEnd > cursor) {
      gaps.push({ start: cursor, end: gapEnd, adjacentTo: b.label });
    }
    cursor = Math.max(cursor, b.end + buffer);
  }
  if (rangeEnd > cursor) {
    gaps.push({ start: cursor, end: rangeEnd, adjacentTo: blocks.at(-1)?.label });
  }
  return gaps;
}

/**
 * Find micro-windows for a member's wellness goals. For each goal, the first gap
 * long enough to host its `durationMin` (preferring gaps adjacent to existing
 * logistics, so the member chains a personal slot onto an errand) becomes a
 * SUGGESTED {@link WellnessWindow}. At most one window per goal. Deterministic.
 */
export function findMicroWindows(
  input: FindMicroWindowsInput,
): WellnessWindowDraft[] {
  const gaps = computeGaps(input);
  // Prefer gaps that sit adjacent to a logistics block (micro-window intent).
  const ordered = [...gaps].sort((a, b) => {
    const adjA = a.adjacentTo ? 0 : 1;
    const adjB = b.adjacentTo ? 0 : 1;
    if (adjA !== adjB) return adjA - adjB;
    return a.start - b.start;
  });

  const out: WellnessWindowDraft[] = [];
  const consumed: Array<{ start: number; end: number }> = [];

  for (const goal of input.goals) {
    if (goal.memberId !== input.member.id) continue;
    const needMs = goal.durationMin * 60_000;
    for (const gap of ordered) {
      // Skip gaps already used by an earlier goal.
      const free = gap.end - gap.start;
      if (free < needMs) continue;
      const overlapsConsumed = consumed.some(
        (c) => gap.start < c.end && c.start < gap.end,
      );
      if (overlapsConsumed) continue;

      const start = gap.start;
      const end = start + needMs;
      consumed.push({ start, end });
      out.push({
        householdId: input.member.householdId,
        memberId: input.member.id,
        goalId: goal.id,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        status: 'SUGGESTED',
      });
      break;
    }
  }

  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Balance battery                                                             */
/* -------------------------------------------------------------------------- */

export interface ComputeBalanceBatteryInput {
  member: Member;
  goals: WellnessGoal[];
  /** Wellness windows for this member (CLAIMED ones count as goals met). */
  windows: WellnessWindow[];
  /** All household tasks, for the logistics-load share. */
  tasks?: Task[];
  members?: Member[];
}

/**
 * Compute a member's {@link BalanceBattery}:
 *   - `goalCompletionPct`: share of target wellness windows actually met
 *     (CLAIMED). 100 when the member has no goals (nothing outstanding).
 *   - `logisticsLoadPct`: this member's share of the household's logistics load
 *     (0 when no tasks / members provided).
 */
export function computeBalanceBattery(
  input: ComputeBalanceBatteryInput,
): BalanceBattery {
  const { member, goals, windows } = input;

  const memberGoals = goals.filter((g) => g.memberId === member.id);
  const targetTotal = memberGoals.reduce((sum, g) => sum + g.targetCount, 0);
  const met = windows.filter(
    (w) => w.memberId === member.id && w.status === 'CLAIMED',
  ).length;

  const goalCompletionPct =
    targetTotal === 0 ? 100 : clamp((met / targetTotal) * 100, 0, 100);

  let logisticsLoadPct = 0;
  if (input.tasks && input.members && input.members.length > 0) {
    const equity = computeLoadEquity({
      members: input.members,
      tasks: input.tasks,
    });
    logisticsLoadPct = equity.find((e) => e.memberId === member.id)?.sharePct ?? 0;
  }

  return {
    memberId: member.id,
    goalCompletionPct: round1(goalCompletionPct),
    logisticsLoadPct: round1(logisticsLoadPct),
  };
}

/* -------------------------------------------------------------------------- */
/* Load equity                                                                 */
/* -------------------------------------------------------------------------- */

/** Urgency → weight used when summing a member's logistics load. */
const URGENCY_WEIGHT: Record<TaskUrgency, number> = {
  LOW: 1,
  MED: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface ComputeLoadEquityInput {
  members: Member[];
  tasks: Task[];
  /** Only count these categories as "logistics load". Default LOGISTICS/SCHOOL/ERRAND. */
  loadCategories?: Task['category'][];
}

/**
 * Compute each member's {@link LoadEquity}: their weighted share of the
 * household's logistics load. Tasks are weighted by urgency and attributed to
 * their `assignedMemberId`. Returns one entry per member (including 0-load ones),
 * sorted by descending share then member id.
 */
export function computeLoadEquity(
  input: ComputeLoadEquityInput,
): LoadEquity[] {
  const categories = new Set<Task['category']>(
    input.loadCategories ?? ['LOGISTICS', 'SCHOOL', 'ERRAND'],
  );

  const loadByMember = new Map<string, number>();
  for (const member of input.members) loadByMember.set(member.id, 0);

  let total = 0;
  for (const task of input.tasks) {
    if (!categories.has(task.category)) continue;
    const assignee = task.assignedMemberId;
    if (!assignee || !loadByMember.has(assignee)) continue;
    const weight = URGENCY_WEIGHT[task.urgency] ?? 2;
    loadByMember.set(assignee, (loadByMember.get(assignee) ?? 0) + weight);
    total += weight;
  }

  const result: LoadEquity[] = input.members.map((m) => {
    const taskLoad = loadByMember.get(m.id) ?? 0;
    const sharePct = total === 0 ? 0 : clamp((taskLoad / total) * 100, 0, 100);
    return { memberId: m.id, sharePct: round1(sharePct), taskLoad };
  });

  result.sort((a, b) =>
    b.sharePct !== a.sharePct
      ? b.sharePct - a.sharePct
      : a.memberId.localeCompare(b.memberId),
  );
  return result;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toMs(clock: Clock): number {
  return typeof clock === 'string' ? new Date(clock).getTime() : clock.getTime();
}
