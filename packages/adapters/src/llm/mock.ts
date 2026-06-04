/**
 * MockLlmProvider — deterministic, secret-free, network-free.
 *
 * `extractTasks` uses regex + the local date parser to turn a scrubbed message
 * into tasks/events: it parses relative dates ("Fri 5pm", "tomorrow"), detects
 * urgency keywords, and recognizes intent like "we should take the kids to X".
 * `route` is a keyword/skill/age heuristic over the candidate members + rules.
 *
 * Output is validated against the runtime Zod schemas before return, so the
 * mock provably satisfies the same contract as the real provider.
 */
import type {
  LlmProvider,
  ExtractionResult,
  RoutingDecision,
  TaskDraft,
  MemberView,
} from '@nestai/contracts';
import type { RoutingRule } from '@nestai/contracts';
import type { TaskUrgency, TaskCategory } from '@nestai/contracts';

import { parseRelativeDate } from '../internal/dates.js';
import {
  ExtractionResultSchema,
  RoutingDecisionSchema,
} from '../zod-runtime.js';

const URGENCY_KEYWORDS: Array<{ re: RegExp; urgency: TaskUrgency }> = [
  { re: /\b(asap|urgent|immediately|right now|emergency)\b/i, urgency: 'CRITICAL' },
  { re: /\b(today|tonight|by end of day|eod|due (?:friday|today|tomorrow))\b/i, urgency: 'HIGH' },
  { re: /\b(tomorrow|this week|soon)\b/i, urgency: 'MED' },
];

const CATEGORY_KEYWORDS: Array<{ re: RegExp; category: TaskCategory }> = [
  { re: /\b(permission slip|homework|teacher|school|class|field trip)\b/i, category: 'SCHOOL' },
  { re: /\b(buy|grab|pick up|groceries|milk|store|errand)\b/i, category: 'ERRAND' },
  { re: /\b(fix|repair|leak|broken|maintenance|replace)\b/i, category: 'MAINTENANCE' },
  { re: /\b(form|sign up|register|renew|pay|bill|appointment)\b/i, category: 'ADMIN' },
  { re: /\b(practice|game|party|trip|park|museum|outing)\b/i, category: 'EVENT' },
  { re: /\b(camp|ski|campsite|season)\b/i, category: 'SEASONAL' },
  { re: /\b(gym|rest|date night|wellness)\b/i, category: 'WELLNESS' },
];

const APPROVAL_RE = /\b(permission slip|fee|\$\s?\d+|\d+\s?dollars|quote|sign|consent)\b/i;

/** Split a message into candidate clauses on sentence/line boundaries. */
function clauses(text: string): string[] {
  return text
    .split(/(?:[.!?\n]+|;|,\s+(?=we should|please|don't forget|remember to))/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function detectUrgency(text: string): TaskUrgency {
  for (const { re, urgency } of URGENCY_KEYWORDS) {
    if (re.test(text)) return urgency;
  }
  return 'LOW';
}

function detectCategory(text: string): TaskCategory {
  for (const { re, category } of CATEGORY_KEYWORDS) {
    if (re.test(text)) return category;
  }
  return 'LOGISTICS';
}

/** Heuristic: does this clause look like an actionable task? */
const TASK_TRIGGER_RE =
  /\b(need to|needs to|don't forget|remember to|please|grab|buy|pick up|fix|sign|pay|book|schedule|call|return|bring|drop off|take out)\b/i;

/** Intent: "we should take the kids to X" / "let's go to X" => an event. */
const INTENT_EVENT_RE =
  /\b(?:we should|let'?s|we could|maybe we|how about we)\b.*?\b(?:take|go to|visit|do|head to|see)\b/i;

function titleCaseFirst(s: string): string {
  const trimmed = s.replace(/^\s*(?:please|don'?t forget to|remember to|can you|could you)\s+/i, '').trim();
  if (!trimmed) return s.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export class MockLlmProvider implements LlmProvider {
  async extractTasks(input: {
    text: string;
    familyContext: string;
    now: string;
  }): Promise<ExtractionResult> {
    const tasks: ExtractionResult['tasks'] = [];
    const events: ExtractionResult['events'] = [];

    for (const clause of clauses(input.text)) {
      const due = parseRelativeDate(clause, input.now);
      const isIntentEvent = INTENT_EVENT_RE.test(clause);

      if (isIntentEvent) {
        events.push({
          title: titleCaseFirst(clause),
          startsAt: due ?? defaultWeekend(input.now),
          allDay: due === null,
          ownerHint: undefined,
          confidence: 0.55,
        });
        continue;
      }

      if (TASK_TRIGGER_RE.test(clause)) {
        const urgency = detectUrgency(clause);
        const category = detectCategory(clause);
        const requiresApproval = APPROVAL_RE.test(clause);
        const requiredSkills = inferSkills(clause);
        tasks.push({
          title: titleCaseFirst(clause),
          description: clause.trim(),
          dueAt: due ?? undefined,
          urgency,
          category,
          requiredSkills,
          requiresApproval,
          suggestedAssignee: undefined,
          confidence: due ? 0.8 : 0.65,
        });
      }
    }

    const all = tasks.length + events.length;
    const result: ExtractionResult = {
      tasks,
      events,
      confidence: all === 0 ? 0.2 : Math.min(0.95, 0.5 + 0.1 * all),
      notes:
        all === 0
          ? 'No actionable tasks or events detected (mock heuristic).'
          : undefined,
    };
    return ExtractionResultSchema.parse(result) as ExtractionResult;
  }

  async route(input: {
    task: TaskDraft;
    members: MemberView[];
    rules: RoutingRule[];
  }): Promise<RoutingDecision> {
    const { task, members, rules } = input;
    const eligible = members.filter((m) => isEligible(m, task));

    const scored = eligible
      .map((m) => ({ m, score: scoreMember(m, task, rules) }))
      .sort((a, b) => b.score - a.score);

    const winner = scored[0];
    if (!winner || winner.score <= 0) {
      const decision: RoutingDecision = {
        assignedMemberId: null,
        confidence: 0,
        rationale: 'No eligible member found for this task (mock heuristic).',
        alternatives: [],
      };
      return RoutingDecisionSchema.parse(decision) as RoutingDecision;
    }

    const alternatives = scored
      .slice(1)
      .map((s) => ({ memberId: s.m.id, score: round2(s.score) }));

    const total = scored.reduce((sum, s) => sum + Math.max(0, s.score), 0);
    const confidence = total > 0 ? round2(Math.min(1, winner.score / total)) : 0.5;

    const decision: RoutingDecision = {
      assignedMemberId: winner.m.id,
      confidence,
      rationale: rationaleFor(winner.m, task, rules),
      alternatives,
    };
    return RoutingDecisionSchema.parse(decision) as RoutingDecision;
  }
}

/* ----------------------------- helpers ----------------------------------- */

function defaultWeekend(nowIso: string): string {
  // Next Saturday at 10:00, used for vague intent events.
  return parseRelativeDate('next saturday 10am', nowIso) ?? new Date(nowIso).toISOString();
}

function inferSkills(text: string): string[] {
  const skills: string[] = [];
  if (/\b(drive|carpool|pick up|drop off|ride)\b/i.test(text)) skills.push('driving');
  if (/\b(fix|repair|tool|assemble)\b/i.test(text)) skills.push('handywork');
  if (/\b(cook|bake|meal|dinner)\b/i.test(text)) skills.push('cooking');
  return skills;
}

function isEligible(m: MemberView, task: TaskDraft): boolean {
  if (task.minAge !== undefined && m.age !== undefined && m.age < task.minAge) return false;
  if (task.maxAge !== undefined && m.age !== undefined && m.age > task.maxAge) return false;
  if (task.requiredSkills.includes('driving') && !m.drivingPrivileges) return false;
  return true;
}

function scoreMember(m: MemberView, task: TaskDraft, rules: RoutingRule[]): number {
  let score = 1; // base
  // Skill overlap.
  const overlap = task.requiredSkills.filter((s) => m.skills.includes(s)).length;
  score += overlap * 3;
  // Availability bias.
  if (m.availabilityState === 'AVAILABLE') score += 2;
  else if (m.availabilityState === 'BUSY') score -= 1;
  else if (m.availabilityState === 'TRAVEL') score -= 2;
  // Head-of-household handles approvals.
  if (task.requiresApproval && m.role === 'HEAD') score += 2;
  // Matching routing rule.
  for (const rule of rules) {
    if (rule.assignToMemberId !== m.id) continue;
    const catMatch = !rule.matchCategory || rule.matchCategory === task.category;
    const skillMatch =
      rule.matchSkills.length === 0 ||
      rule.matchSkills.some((s) => task.requiredSkills.includes(s));
    if (catMatch && skillMatch) score += 5 + rule.priority;
  }
  return score;
}

function rationaleFor(m: MemberView, task: TaskDraft, rules: RoutingRule[]): string {
  const reasons: string[] = [];
  const overlap = task.requiredSkills.filter((s) => m.skills.includes(s));
  if (overlap.length > 0) reasons.push(`has required skill(s): ${overlap.join(', ')}`);
  if (m.availabilityState === 'AVAILABLE') reasons.push('currently available');
  if (task.requiresApproval && m.role === 'HEAD') reasons.push('can grant approval as head of household');
  const matchedRule = rules.find(
    (r) =>
      r.assignToMemberId === m.id &&
      (!r.matchCategory || r.matchCategory === task.category),
  );
  if (matchedRule) reasons.push(`matched routing rule "${matchedRule.name}"`);
  if (reasons.length === 0) reasons.push('best available fallback');
  return `${m.displayName}: ${reasons.join('; ')}.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
