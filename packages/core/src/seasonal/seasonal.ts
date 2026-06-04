/**
 * Seasonal engine.
 *
 * Two responsibilities, both pure and time-injected:
 *
 *   1. {@link computeMilestones} — given a {@link SeasonalProject} and a matching
 *      {@link RegistrationTimeline}, resolve the project's open/goal date and emit
 *      the four staged {@link Milestone}s (PREP_30D / ASSET_CHECK_14D / FINAL_48H /
 *      JIT_15M) with stage-appropriate copy.
 *
 *   2. {@link classifySeasonalIntent} — a lightweight keyword classifier that
 *      decides whether free text expresses a seasonal intent, and which
 *      {@link SeasonalKind} it maps to (e.g. "take the kids to Yosemite this fall"
 *      → CAMPSITE / TRIP).
 *
 * Nothing here reaches for `Date.now()`; callers pass `now`.
 */
import type {
  SeasonalProject,
  RegistrationTimeline,
  Milestone,
  SeasonalKind,
  MilestoneStage,
} from '@nestai/contracts';
import { toDate, toIso, addMinutes, type Clock } from '../time.js';

/* -------------------------------------------------------------------------- */
/* Milestone computation                                                       */
/* -------------------------------------------------------------------------- */

/** Lead offsets (relative to the goal date) for each milestone stage. */
const STAGE_OFFSETS: Record<MilestoneStage, { minutes: number }> = {
  PREP_30D: { minutes: -30 * 24 * 60 },
  ASSET_CHECK_14D: { minutes: -14 * 24 * 60 },
  FINAL_48H: { minutes: -48 * 60 },
  JIT_15M: { minutes: -15 },
};

/** The ordered stages a seasonal project fires through. */
export const MILESTONE_STAGE_ORDER: MilestoneStage[] = [
  'PREP_30D',
  'ASSET_CHECK_14D',
  'FINAL_48H',
  'JIT_15M',
];

export interface ComputeMilestonesInput {
  project: SeasonalProject;
  /** Matching timeline (its `opensRule`/`leadDays` resolve the goal date). */
  timeline?: RegistrationTimeline;
  /**
   * Explicit goal/open date override. When supplied it wins over the timeline
   * and the project's `targetWindow`.
   */
  goalDate?: Clock;
  now: Clock;
}

/**
 * Resolve the project's "goal date" — the anchor all milestones are measured
 * back from. Resolution order: explicit `goalDate` → timeline `opensRule`
 * (offset by `leadDays`) → project `targetWindow.start`.
 */
export function resolveGoalDate(input: ComputeMilestonesInput): Date {
  if (input.goalDate != null) return toDate(input.goalDate);

  if (input.timeline) {
    const opens = parseOpensRule(input.timeline.opensRule, input.now);
    if (opens) {
      // Registration opens `leadDays` before we want to be ready; the goal is
      // the opening date itself (we prep ahead of it via the staged offsets).
      return opens;
    }
  }

  if (input.project.targetWindow?.start) {
    return toDate(input.project.targetWindow.start);
  }

  throw new Error(
    'Cannot resolve seasonal goal date: provide goalDate, a parseable timeline.opensRule, or project.targetWindow.',
  );
}

/**
 * Parse a timeline `opensRule`. Supports an ISO date, a "YYYY-MM-DD", or a
 * loose "Month [Day]" phrase (e.g. "March 1", "September"); month-only phrases
 * resolve to the first of that month, in the next occurrence at/after `now`.
 */
export function parseOpensRule(rule: string, now: Clock): Date | undefined {
  const trimmed = rule.trim();

  // Full ISO / YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const iso = /T/.test(trimmed) ? trimmed : `${trimmed}T00:00:00.000Z`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // "Month [Day]" phrase.
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  const m = /([A-Za-z]+)\s*(\d{1,2})?/.exec(trimmed);
  if (m) {
    const monthIdx = months[m[1]!.toLowerCase()];
    if (monthIdx != null) {
      const day = m[2] ? Number(m[2]) : 1;
      const ref = toDate(now);
      let year = ref.getUTCFullYear();
      let candidate = new Date(Date.UTC(year, monthIdx, day));
      if (candidate.getTime() < ref.getTime()) {
        candidate = new Date(Date.UTC(year + 1, monthIdx, day));
      }
      return candidate;
    }
  }
  return undefined;
}

/** Stage-appropriate copy for a milestone, parameterized by project + goal. */
export function milestoneContent(
  stage: MilestoneStage,
  project: SeasonalProject,
  goal: Date,
): string {
  const label = project.title;
  const when = goal.toISOString().slice(0, 10);
  switch (stage) {
    case 'PREP_30D':
      return `30-day prep for "${label}": confirm dates (target ${when}), budget and who's going. Start any registrations now.`;
    case 'ASSET_CHECK_14D':
      return `2-week asset check for "${label}": verify gear and vehicle readiness, and audit kids' sizes before ${when}.`;
    case 'FINAL_48H':
      return `48-hour final for "${label}": pack, confirm reservations and assign drivers for ${when}.`;
    case 'JIT_15M':
      return `Heads up — "${label}" starts in 15 minutes. Grab the bags and go.`;
    default:
      return `Milestone for "${label}".`;
  }
}

/**
 * Compute the four staged milestones for a seasonal project. Milestones are
 * returned in stage order (earliest fireAt first). `fired` is always false;
 * ids/timestamps are left to the persistence layer (this is pure compute), so
 * the returned objects omit `id`/`createdAt`/`updatedAt` and are typed as
 * drafts.
 */
export type MilestoneDraft = Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>;

export function computeMilestones(input: ComputeMilestonesInput): MilestoneDraft[] {
  const goal = resolveGoalDate(input);
  return MILESTONE_STAGE_ORDER.map((stage) => {
    const fireAt = addMinutes(goal, STAGE_OFFSETS[stage].minutes);
    return {
      householdId: input.project.householdId,
      seasonalProjectId: input.project.id,
      stage,
      fireAt: toIso(fireAt),
      content: milestoneContent(stage, input.project, goal),
      fired: false,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Intent classification                                                       */
/* -------------------------------------------------------------------------- */

export interface SeasonalIntent {
  isSeasonal: boolean;
  kind?: SeasonalKind;
  /** 0..1 keyword-match confidence. */
  confidence: number;
  /** The keywords that triggered the match. */
  matched: string[];
}

/** Keyword → SeasonalKind mapping (lowercase, word-boundary matched). */
const KIND_KEYWORDS: Array<{ kind: SeasonalKind; words: string[] }> = [
  { kind: 'SKI_TRIP', words: ['ski', 'skiing', 'snowboard', 'slopes', 'mountain resort'] },
  { kind: 'CAMPSITE', words: ['campsite', 'campground', 'camping', 'tent', 'rv site', 'yosemite', 'national park', 'state park'] },
  { kind: 'CAMP', words: ['summer camp', 'day camp', 'sleepaway', 'camp signup', 'camp registration'] },
  { kind: 'SPORTS', words: ['soccer', 'little league', 'baseball', 'season signup', 'sports registration', 'travel team'] },
  { kind: 'TRIP', words: ['trip', 'vacation', 'getaway', 'road trip', 'holiday', 'visit'] },
];

/** Phrases that imply seasonal/forward planning intent. */
const SEASONAL_HINTS = [
  'this fall', 'this summer', 'this winter', 'this spring',
  'next year', 'next season', 'this season', 'over the holidays',
  'this weekend', 'plan', 'book', 'reserve', 'sign up', 'register',
];

/**
 * Classify whether `text` expresses a seasonal intent and, if so, which
 * {@link SeasonalKind} it most likely is. Deterministic keyword scoring; the
 * highest-scoring kind wins. A seasonal hint alone (without a kind) still marks
 * the text seasonal but leaves `kind` undefined.
 */
export function classifySeasonalIntent(text: string): SeasonalIntent {
  const lower = ` ${text.toLowerCase()} `;
  const matched: string[] = [];

  let bestKind: SeasonalKind | undefined;
  let bestScore = 0;
  for (const { kind, words } of KIND_KEYWORDS) {
    let score = 0;
    for (const w of words) {
      if (new RegExp(`\\b${escapeRegExp(w)}\\b`).test(lower)) {
        score += 1;
        matched.push(w);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestKind = kind;
    }
  }

  const hints = SEASONAL_HINTS.filter((h) =>
    new RegExp(`\\b${escapeRegExp(h)}\\b`).test(lower),
  );
  matched.push(...hints);

  const isSeasonal = bestScore > 0 || hints.length > 0;
  // Confidence: kind match weighs more than a bare hint.
  const raw = bestScore * 0.4 + (hints.length > 0 ? 0.3 : 0);
  const confidence = isSeasonal ? Math.min(1, Math.max(0.3, raw)) : 0;

  return {
    isSeasonal,
    kind: bestKind,
    confidence,
    matched: [...new Set(matched)],
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Raw day offset for a stage relative to the goal date (negative = before). */
export function stageLeadDays(stage: MilestoneStage): number {
  return STAGE_OFFSETS[stage].minutes / (24 * 60);
}
