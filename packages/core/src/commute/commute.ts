/**
 * Commute & conflict.
 *
 * Pure, time-injected logistics helpers:
 *
 *   1. {@link filterByCommute} — rule out members whose office location +
 *      commute time makes a pickup window physically infeasible (the classic
 *      "the 40-minutes-away parent can't make the 3:15 pickup").
 *
 *   2. {@link assignByRouteSynergy} — assign a drop-off to the adult whose
 *      commute route already passes the school/destination (least marginal
 *      cost).
 *
 *   3. {@link detectConflicts} — a Conflict Radar producing {@link Conflict}s of
 *      type SOLE_DRIVER / RIPPLE_SHIFT / BUFFER_SQUEEZE with severity and
 *      mitigation text.
 *
 * Nothing reaches for `Date.now()`; callers pass `now`.
 */
import type {
  Member,
  Conflict,
  ConflictType,
  ConflictSeverity,
  Location,
} from '@nestai/contracts';
import { diffMinutes, type Clock } from '../time.js';

/* -------------------------------------------------------------------------- */
/* Commute-aware availability filter                                           */
/* -------------------------------------------------------------------------- */

export interface CommuteFilterInput {
  members: Member[];
  /** When the pickup/drop-off must happen (the hard arrival deadline). */
  pickupAt: Clock;
  /**
   * When each member is free to leave their current location (e.g. end of
   * workday). Defaults to {@link defaultLeaveAt} if not provided per member.
   */
  leaveAt?: Clock;
  /** Buffer minutes required on top of pure travel time. Default 0. */
  bufferMinutes?: number;
  /** Only consider drivers when true. */
  requiresDriving?: boolean;
}

export interface CommuteFilterResult {
  feasible: Member[];
  infeasible: Array<{ member: Member; reason: string }>;
}

/**
 * Filter members to those who can physically reach the pickup in time. A member
 * is infeasible when `leaveAt + commuteMinutes (+ buffer) > pickupAt`. Members
 * with no commute info are treated as feasible (unknown ≠ ruled out), unless
 * driving is required and they lack privileges.
 */
export function filterByCommute(
  input: CommuteFilterInput,
): CommuteFilterResult {
  const buffer = input.bufferMinutes ?? 0;
  const feasible: Member[] = [];
  const infeasible: Array<{ member: Member; reason: string }> = [];

  for (const member of input.members) {
    if (member.active === false) {
      infeasible.push({ member, reason: 'inactive' });
      continue;
    }
    if (input.requiresDriving && !member.drivingPrivileges) {
      infeasible.push({ member, reason: 'cannot drive' });
      continue;
    }

    const commute = member.commuteMinutes;
    if (commute == null) {
      // No commute data: don't rule out.
      feasible.push(member);
      continue;
    }

    const leaveAt = input.leaveAt;
    if (leaveAt == null) {
      // No leave time supplied: we can't disprove feasibility, keep them.
      feasible.push(member);
      continue;
    }

    // Available travel budget from when they can leave until the deadline.
    const budget = diffMinutes(input.pickupAt, leaveAt);
    const needed = commute + buffer;
    if (needed > budget) {
      infeasible.push({
        member,
        reason: `commute ${commute}m + buffer ${buffer}m exceeds ${budget}m available before pickup`,
      });
    } else {
      feasible.push(member);
    }
  }

  return { feasible, infeasible };
}

/* -------------------------------------------------------------------------- */
/* Route-synergy assignment                                                    */
/* -------------------------------------------------------------------------- */

/** Cheap "passes near" check: a member's office is near the destination. */
function distanceKm(a?: Location, b?: Location): number | undefined {
  if (
    a?.lat == null ||
    a?.lng == null ||
    b?.lat == null ||
    b?.lng == null
  ) {
    return undefined;
  }
  // Equirectangular approximation — fine for "who's closer" ranking.
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x = (toRad(b.lng) - toRad(a.lng)) * Math.cos(toRad((a.lat + b.lat) / 2));
  const y = toRad(b.lat) - toRad(a.lat);
  return Math.sqrt(x * x + y * y) * R;
}

export interface RouteSynergyInput {
  members: Member[];
  /** The school / drop-off destination. */
  destination: Location;
  /** Members whose route passes within this many km score as on-route. Default 5. */
  onRouteKm?: number;
  requiresDriving?: boolean;
}

export interface RouteSynergyResult {
  assignedMemberId: string | null;
  rationale: string;
  ranked: Array<{ memberId: string; detourKm?: number; score: number }>;
}

/**
 * Assign a drop-off to the adult whose commute most naturally passes the
 * destination. Members closer (by office→destination distance) score higher; a
 * member already on-route (within `onRouteKm`) is strongly preferred. Falls back
 * to commute proximity when no geo data exists. Deterministic ordering.
 */
export function assignByRouteSynergy(
  input: RouteSynergyInput,
): RouteSynergyResult {
  const onRouteKm = input.onRouteKm ?? 5;
  const ranked: Array<{ memberId: string; detourKm?: number; score: number }> =
    [];

  for (const member of input.members) {
    if (member.active === false) continue;
    if (member.role === 'DEPENDENT') continue;
    if (input.requiresDriving && !member.drivingPrivileges) continue;
    if (!member.drivingPrivileges) continue;

    const detourKm = distanceKm(member.officeLocation, input.destination);
    let score = 0;
    if (detourKm != null) {
      if (detourKm <= onRouteKm) {
        score += 100; // on-route bonus
      }
      score += Math.max(0, 50 - detourKm); // closer is better
    } else if (member.commuteMinutes != null) {
      // No geo: fall back to commute length as a weak proxy.
      score += Math.max(0, 30 - member.commuteMinutes);
    }
    ranked.push({ memberId: member.id, detourKm, score });
  }

  ranked.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.memberId.localeCompare(b.memberId),
  );

  const top = ranked[0];
  if (!top) {
    return {
      assignedMemberId: null,
      rationale: 'No eligible driver for the drop-off.',
      ranked,
    };
  }
  const detour =
    top.detourKm != null ? `${top.detourKm.toFixed(1)}km from route` : 'commute proxy';
  return {
    assignedMemberId: top.memberId,
    rationale: `Assigned ${top.memberId}: route passes destination (${detour}).`,
    ranked,
  };
}

/* -------------------------------------------------------------------------- */
/* Conflict Radar                                                              */
/* -------------------------------------------------------------------------- */

/** A logistics commitment (drop-off / pickup) attributed to a member. */
export interface LogisticsCommitment {
  taskId?: string;
  memberId: string;
  /** Whether this commitment needs a driver. */
  requiresDriver?: boolean;
  startsAt: Clock;
  endsAt: Clock;
  label?: string;
}

export type ConflictDraft = Omit<
  Conflict,
  'id' | 'householdId' | 'createdAt' | 'updatedAt'
>;

export interface DetectConflictsInput {
  commitments: LogisticsCommitment[];
  members: Member[];
  /** Minutes of slack below which two back-to-back commitments squeeze. Default 15. */
  bufferThresholdMinutes?: number;
  now: Clock;
}

/** Count members able to drive in the pool. */
function drivingMembers(members: Member[]): Member[] {
  return members.filter(
    (m) => m.active !== false && m.drivingPrivileges && m.role !== 'DEPENDENT',
  );
}

/**
 * Conflict Radar. Surfaces three conflict classes:
 *
 *   - SOLE_DRIVER: a driving commitment exists but only one capable driver is
 *     in the household (single point of failure).
 *   - RIPPLE_SHIFT: two commitments for the *same* member overlap, so honoring
 *     one shifts/breaks the other.
 *   - BUFFER_SQUEEZE: two back-to-back commitments for one member leave less
 *     than the buffer threshold of slack between them.
 *
 * Returns {@link ConflictDraft}s (persistence fields omitted), sorted by
 * descending severity then window start.
 */
export function detectConflicts(input: DetectConflictsInput): ConflictDraft[] {
  const bufferThreshold = input.bufferThresholdMinutes ?? 15;
  const out: ConflictDraft[] = [];
  const drivers = drivingMembers(input.members);
  const nowIso = new Date(toMs(input.now)).toISOString();

  // SOLE_DRIVER: any driving commitment + exactly one capable driver.
  const drivingCommitments = input.commitments.filter((c) => c.requiresDriver);
  if (drivingCommitments.length > 0 && drivers.length === 1) {
    const sole = drivers[0]!;
    for (const c of drivingCommitments) {
      out.push({
        type: 'SOLE_DRIVER',
        severity: 'HIGH',
        description: `${sole.displayName} is the only available driver for "${c.label ?? 'a drive'}" — a single point of failure.`,
        mitigation: `Line up a backup driver or carpool partner; consider granting another adult driving duties for ${c.label ?? 'this run'}.`,
        windowStart: new Date(toMs(c.startsAt)).toISOString(),
        windowEnd: new Date(toMs(c.endsAt)).toISOString(),
        ...(c.taskId ? { relatedTaskId: c.taskId } : {}),
      });
    }
  }

  // Per-member pairwise checks for ripple/buffer.
  const byMember = new Map<string, LogisticsCommitment[]>();
  for (const c of input.commitments) {
    const list = byMember.get(c.memberId) ?? [];
    list.push(c);
    byMember.set(c.memberId, list);
  }

  for (const [memberId, list] of byMember) {
    const member = input.members.find((m) => m.id === memberId);
    const name = member?.displayName ?? memberId;
    const sorted = [...list].sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      const aEnd = toMs(a.endsAt);
      const bStart = toMs(b.startsAt);

      if (bStart < aEnd) {
        // Overlap → ripple.
        out.push({
          type: 'RIPPLE_SHIFT',
          severity: 'HIGH',
          description: `${name} is double-booked: "${a.label ?? 'commitment A'}" overlaps "${b.label ?? 'commitment B'}".`,
          mitigation: `Reassign one commitment to another member or shift its time; honoring one will ripple into the other.`,
          windowStart: new Date(bStart).toISOString(),
          windowEnd: new Date(aEnd).toISOString(),
          ...(b.taskId ? { relatedTaskId: b.taskId } : {}),
        });
      } else {
        const slack = Math.floor((bStart - aEnd) / 60_000);
        if (slack < bufferThreshold) {
          out.push({
            type: 'BUFFER_SQUEEZE',
            severity: slack <= 5 ? 'MEDIUM' : 'LOW',
            description: `${name} has only ${slack}m between "${a.label ?? 'commitment A'}" and "${b.label ?? 'commitment B'}".`,
            mitigation: `Add buffer: move one commitment by ~${bufferThreshold - slack}m, or hand one off to avoid a tight transition.`,
            windowStart: new Date(aEnd).toISOString(),
            windowEnd: new Date(bStart).toISOString(),
            ...(b.taskId ? { relatedTaskId: b.taskId } : {}),
          });
        }
      }
    }
  }

  // Touch nowIso so the parameter is meaningful for callers wanting audit time.
  void nowIso;

  const sevRank: Record<ConflictSeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  out.sort((a, b) => {
    const s = sevRank[b.severity] - sevRank[a.severity];
    if (s !== 0) return s;
    return (a.windowStart ?? '').localeCompare(b.windowStart ?? '');
  });
  return out;
}

/** Re-exported type alias for callers building full Conflict rows. */
export type { ConflictType };

function toMs(clock: Clock): number {
  return typeof clock === 'string' ? new Date(clock).getTime() : clock.getTime();
}
