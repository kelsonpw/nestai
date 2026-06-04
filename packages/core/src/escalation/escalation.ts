/**
 * Escalation engine.
 *
 * A pure, time-injected state machine for the lifecycle of a dropped task:
 *
 *   drop → cascade → backup-selection → broadcast → claim → lock
 *
 * Responsibilities:
 *   - {@link classifyUrgencyCascade} — decide whether to OFFER the task to the
 *     next single member (LOW/MED) or BROADCAST to everyone (HIGH/CRITICAL).
 *   - {@link selectBackup} — pick the best eligible backup adult (cleared
 *     schedule in the window, driving privileges where required, within commute
 *     radius).
 *   - {@link claim} / {@link reject} — transitions. A reject marks that member
 *     BUSY and bumps the escalation tier.
 *   - {@link decideCriticalOverride} — when no claim lands within 20 minutes of
 *     the deadline, escalate to CRITICAL_OVERRIDE.
 *
 * Nothing reaches for `Date.now()`; callers pass `now`.
 */
import type {
  Member,
  Task,
  TaskUrgency,
  EscalationEvent,
  AvailabilityBlock,
} from '@nestai/contracts';
import { diffMinutes, windowsOverlap, type Clock } from '../time.js';

/* -------------------------------------------------------------------------- */
/* Urgency cascade                                                             */
/* -------------------------------------------------------------------------- */

/** How a dropped task should be re-offered. */
export type CascadeMode = 'OFFER' | 'BROADCAST';

export interface CascadeDecision {
  mode: CascadeMode;
  rationale: string;
}

/**
 * Classify the cascade mode for an urgency. LOW/MED offer to the next single
 * member (least disruptive); HIGH/CRITICAL broadcast to the whole eligible pool.
 */
export function classifyUrgencyCascade(urgency: TaskUrgency): CascadeDecision {
  switch (urgency) {
    case 'HIGH':
    case 'CRITICAL':
      return {
        mode: 'BROADCAST',
        rationale: `${urgency} urgency: broadcast to all eligible members.`,
      };
    case 'MED':
    case 'LOW':
    default:
      return {
        mode: 'OFFER',
        rationale: `${urgency} urgency: offer to the next single member.`,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Backup selection                                                            */
/* -------------------------------------------------------------------------- */

export interface SelectBackupInput {
  /** Pool of candidate members (the dropper is typically excluded by caller). */
  members: Member[];
  /** Window the task must be covered in. */
  windowStart: Clock;
  windowEnd: Clock;
  /** Availability blocks across members; BUSY/TRAVEL blocks rule a member out. */
  availability?: AvailabilityBlock[];
  /** When true, only members with drivingPrivileges are eligible. */
  requiresDriving?: boolean;
  /** Max acceptable one-way commute minutes (radius). Default: no limit. */
  maxCommuteMinutes?: number;
  /** Exclude these member ids (e.g. the dropper, those who already rejected). */
  excludeMemberIds?: string[];
}

export interface BackupCandidate {
  member: Member;
  score: number;
  reasons: string[];
}

export interface SelectBackupResult {
  selected: Member | null;
  candidates: BackupCandidate[];
  rationale: string;
}

/** A member is "cleared" if no BUSY/TRAVEL block overlaps the target window. */
function hasClearedSchedule(
  memberId: string,
  windowStart: Clock,
  windowEnd: Clock,
  availability: AvailabilityBlock[],
): boolean {
  for (const block of availability) {
    if (block.memberId !== memberId) continue;
    if (block.kind === 'AVAILABLE') continue;
    if (windowsOverlap(block.startsAt, block.endsAt, windowStart, windowEnd)) {
      return false;
    }
  }
  return true;
}

/**
 * Select the best eligible backup adult. Eligibility: HEAD/THIRD_PARTY (adults),
 * active, not excluded, cleared schedule in the window, driving privileges when
 * required, and within the commute radius. Among the eligible, prefer AVAILABLE
 * state and shorter commute. Deterministic: ties break on member id.
 */
export function selectBackup(input: SelectBackupInput): SelectBackupResult {
  const availability = input.availability ?? [];
  const exclude = new Set(input.excludeMemberIds ?? []);
  const candidates: BackupCandidate[] = [];

  for (const member of input.members) {
    if (exclude.has(member.id)) continue;
    if (member.active === false) continue;
    // Backups are adults: dependents are never selected as backup drivers.
    if (member.role === 'DEPENDENT') continue;

    const reasons: string[] = [];

    if (
      input.requiresDriving &&
      !member.drivingPrivileges
    ) {
      continue;
    }
    if (input.requiresDriving) reasons.push('has driving privileges');

    if (
      !hasClearedSchedule(
        member.id,
        input.windowStart,
        input.windowEnd,
        availability,
      )
    ) {
      continue;
    }
    reasons.push('schedule cleared in window');

    if (
      input.maxCommuteMinutes != null &&
      member.commuteMinutes != null &&
      member.commuteMinutes > input.maxCommuteMinutes
    ) {
      continue;
    }

    let score = 0;
    if (member.availabilityState === 'AVAILABLE') {
      score += 50;
      reasons.push('available now (+50)');
    } else if (member.availabilityState === 'TRAVEL') {
      score += 10;
      reasons.push('travelling (+10)');
    }
    if (member.drivingPrivileges) {
      score += 10;
      reasons.push('can drive (+10)');
    }
    if (member.commuteMinutes != null) {
      // Shorter commute scores higher (closer = faster to cover).
      const proximity = Math.max(0, 60 - member.commuteMinutes);
      score += proximity;
      reasons.push(`commute ${member.commuteMinutes}m (+${proximity})`);
    }

    candidates.push({ member, score, reasons });
  }

  candidates.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.member.id.localeCompare(b.member.id),
  );

  const selected = candidates[0]?.member ?? null;
  const rationale = selected
    ? `Selected ${selected.displayName}: ${candidates[0]!.reasons.join('; ')}.`
    : 'No eligible backup found (none had a cleared schedule / driving / commute fit).';

  return { selected, candidates, rationale };
}

/* -------------------------------------------------------------------------- */
/* Claim / reject transitions                                                  */
/* -------------------------------------------------------------------------- */

/** An escalation draft as the engine mutates it (omits persistence fields). */
export type EscalationState = Pick<
  EscalationEvent,
  'taskId' | 'tier' | 'deadline'
> & {
  broadcastAt?: string;
  claimedById?: string;
  resolvedAt?: string;
  householdId: string;
};

export interface ClaimResult {
  event: EscalationState;
  /** The task patch the caller should apply (status/assignee). */
  taskPatch: Partial<Pick<Task, 'status' | 'assignedMemberId'>>;
  ok: boolean;
  reason: string;
}

/**
 * Claim an escalated task for a member: locks it (status CLAIMED), records the
 * claimant + resolution time. Already-resolved events cannot be re-claimed.
 */
export function claim(
  event: EscalationState,
  memberId: string,
  now: Clock,
): ClaimResult {
  if (event.resolvedAt != null || event.claimedById != null) {
    return {
      event,
      taskPatch: {},
      ok: false,
      reason: 'Already claimed/resolved — claim ignored (idempotent lock).',
    };
  }
  const nowIso = new Date(toMs(now)).toISOString();
  const next: EscalationState = {
    ...event,
    claimedById: memberId,
    resolvedAt: nowIso,
  };
  return {
    event: next,
    taskPatch: { status: 'CLAIMED', assignedMemberId: memberId },
    ok: true,
    reason: `Claimed by ${memberId} and locked.`,
  };
}

export interface RejectResult {
  event: EscalationState;
  /** The rejecting member's availability transitions to BUSY. */
  memberPatch: { id: string; availabilityState: 'BUSY' };
  ok: boolean;
  reason: string;
}

/**
 * A member rejects (declines) the offer. This marks that member BUSY and bumps
 * the escalation tier so the next round broadens the search. Resolved events are
 * not re-opened by a reject.
 */
export function reject(
  event: EscalationState,
  memberId: string,
): RejectResult {
  if (event.resolvedAt != null) {
    return {
      event,
      memberPatch: { id: memberId, availabilityState: 'BUSY' },
      ok: false,
      reason: 'Event already resolved — reject ignored.',
    };
  }
  const next: EscalationState = { ...event, tier: event.tier + 1 };
  return {
    event: next,
    memberPatch: { id: memberId, availabilityState: 'BUSY' },
    ok: true,
    reason: `${memberId} rejected; marked BUSY and escalated to tier ${next.tier}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Critical override                                                           */
/* -------------------------------------------------------------------------- */

/** Minutes-before-deadline threshold that triggers a critical override. */
export const CRITICAL_OVERRIDE_MINUTES = 20;

export interface CriticalOverrideDecision {
  override: boolean;
  minutesToDeadline: number;
  reason: string;
}

/**
 * Decide whether to fire a CRITICAL_OVERRIDE: true when the event is still
 * unclaimed and `now` is within {@link CRITICAL_OVERRIDE_MINUTES} of (or past)
 * the deadline. Already-claimed/resolved events never override.
 */
export function decideCriticalOverride(
  event: EscalationState,
  now: Clock,
): CriticalOverrideDecision {
  const minutesToDeadline = diffMinutes(event.deadline, now);
  if (event.claimedById != null || event.resolvedAt != null) {
    return {
      override: false,
      minutesToDeadline,
      reason: 'Already claimed/resolved — no override needed.',
    };
  }
  const override = minutesToDeadline <= CRITICAL_OVERRIDE_MINUTES;
  return {
    override,
    minutesToDeadline,
    reason: override
      ? `No claim within ${CRITICAL_OVERRIDE_MINUTES}m of deadline (${minutesToDeadline}m left) — CRITICAL_OVERRIDE.`
      : `${minutesToDeadline}m to deadline — still within the claim window.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function toMs(clock: Clock): number {
  return typeof clock === 'string' ? new Date(clock).getTime() : clock.getTime();
}
