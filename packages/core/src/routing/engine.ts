/**
 * Rules engine.
 *
 * Pure, deterministic task -> member routing. Given a {@link TaskDraft}, the
 * household {@link Member}s and a set of {@link RoutingRule}s, it picks the best
 * eligible assignee respecting required skills, min/max age and rule priority,
 * returning a {@link RoutingDecision} with a human-readable rationale.
 */
import type {
  Member,
  RoutingRule,
  TaskDraft,
  RoutingDecision,
} from '@nestai/contracts';
import { computeAge } from './age.js';
import { type Clock } from '../time.js';

export interface RouteInput {
  task: TaskDraft;
  members: Member[];
  rules?: RoutingRule[];
  now: Clock;
}

interface Candidate {
  member: Member;
  age?: number;
  score: number;
  reasons: string[];
  forcedByRule?: RoutingRule;
}

/** True when a member satisfies the task's hard constraints. */
function isEligible(
  member: Member,
  task: TaskDraft,
  age: number | undefined,
): { ok: boolean; reason?: string } {
  if (member.active === false) return { ok: false, reason: 'inactive' };
  // Required skills must all be present.
  for (const skill of task.requiredSkills ?? []) {
    if (!member.skills?.includes(skill)) {
      return { ok: false, reason: `missing skill "${skill}"` };
    }
  }
  if (task.minAge != null) {
    if (age == null) return { ok: false, reason: 'age unknown (minAge required)' };
    if (age < task.minAge) return { ok: false, reason: `under minAge ${task.minAge}` };
  }
  if (task.maxAge != null) {
    if (age == null) return { ok: false, reason: 'age unknown (maxAge required)' };
    if (age > task.maxAge) return { ok: false, reason: `over maxAge ${task.maxAge}` };
  }
  return { ok: true };
}

/** Does a rule match the given task? */
function ruleMatchesTask(rule: RoutingRule, task: TaskDraft): boolean {
  if (rule.matchCategory != null && rule.matchCategory !== task.category) return false;
  for (const skill of rule.matchSkills ?? []) {
    if (!task.requiredSkills?.includes(skill)) return false;
  }
  return true;
}

/** Does a member satisfy a rule's own age/skill targeting? */
function ruleAppliesToMember(
  rule: RoutingRule,
  member: Member,
  age: number | undefined,
): boolean {
  for (const skill of rule.matchSkills ?? []) {
    if (!member.skills?.includes(skill)) return false;
  }
  if (rule.minAge != null && (age == null || age < rule.minAge)) return false;
  if (rule.maxAge != null && (age == null || age > rule.maxAge)) return false;
  if (rule.assignToMemberId != null && rule.assignToMemberId !== member.id) return false;
  return true;
}

/**
 * Score an eligible candidate. Higher is better. Soft signals only —
 * availability, driving privileges and skill overlap beyond the required set.
 */
function scoreCandidate(member: Member, task: TaskDraft, age: number | undefined): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  switch (member.availabilityState) {
    case 'AVAILABLE':
      score += 30;
      reasons.push('available now (+30)');
      break;
    case 'TRAVEL':
      score += 5;
      reasons.push('travelling (+5)');
      break;
    case 'BUSY':
    default:
      reasons.push('busy (+0)');
      break;
  }

  // Driving privileges help logistics/errand/school tasks.
  if (
    member.drivingPrivileges &&
    (task.category === 'LOGISTICS' ||
      task.category === 'ERRAND' ||
      task.category === 'SCHOOL')
  ) {
    score += 15;
    reasons.push('has driving privileges for this category (+15)');
  }

  // Reward extra relevant skills (beyond required), capped.
  const extra = (member.skills ?? []).filter((s) => task.requiredSkills?.includes(s));
  if (extra.length > 0) {
    const bonus = Math.min(10, extra.length * 5);
    score += bonus;
    reasons.push(`matches ${extra.length} required skill(s) (+${bonus})`);
  }

  // Heads tend to absorb ADMIN/approval-bearing tasks.
  if (member.role === 'HEAD' && (task.category === 'ADMIN' || task.requiresApproval)) {
    score += 8;
    reasons.push('head handles admin/approval (+8)');
  }

  return { score, reasons };
}

/**
 * Pick the best assignee for a task. Returns a {@link RoutingDecision}; when no
 * member is eligible, `assignedMemberId` is null with a confidence of 0.
 */
export function route(input: RouteInput): RoutingDecision {
  const { task, members, now } = input;
  const rules = [...(input.rules ?? [])]
    .filter((r) => ruleMatchesTask(r, task))
    .sort((a, b) => b.priority - a.priority);

  const candidates: Candidate[] = [];
  for (const member of members) {
    const age = computeAge(member.birthDate, now);
    const elig = isEligible(member, task, age);
    if (!elig.ok) continue;
    const { score, reasons } = scoreCandidate(member, task, age);
    candidates.push({ member, age, score, reasons });
  }

  if (candidates.length === 0) {
    return {
      assignedMemberId: null,
      confidence: 0,
      rationale:
        'No eligible member: none satisfied the required skills and/or age constraints.',
    };
  }

  // Apply rules in priority order: the first rule that both matches the task
  // and applies to an eligible member forces (and boosts) that assignment.
  for (const rule of rules) {
    const target = candidates.find((c) => ruleAppliesToMember(rule, c.member, c.age));
    if (target) {
      target.forcedByRule = rule;
      target.score += 1000 + rule.priority;
      target.reasons.push(`forced by rule "${rule.name}" (priority ${rule.priority})`);
      break;
    }
  }

  // Deterministic ordering: score desc, then member id asc for stable ties.
  candidates.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.member.id.localeCompare(b.member.id),
  );

  const best = candidates[0]!;
  const alternatives = candidates
    .slice(1)
    .map((c) => ({ memberId: c.member.id, score: c.score }));

  // Confidence: gap between best and runner-up, normalized; forced rules => high.
  let confidence: number;
  if (best.forcedByRule) {
    confidence = 0.95;
  } else if (candidates.length === 1) {
    confidence = 0.9;
  } else {
    const second = candidates[1]!.score;
    const gap = best.score - second;
    confidence = Math.min(0.9, 0.5 + gap / 100);
  }

  const rationale =
    `Assigned ${best.member.displayName}: ${best.reasons.join('; ')}.` +
    (alternatives.length
      ? ` ${alternatives.length} alternative(s) considered.`
      : '');

  return {
    assignedMemberId: best.member.id,
    confidence: Math.max(0, Math.min(1, confidence)),
    rationale,
    alternatives,
  };
}
