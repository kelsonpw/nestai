/**
 * Recurrence generator.
 *
 * Expands RFC-5545 RRULE strings (via the `rrule` library) into concrete due
 * dates, and provides a home-maintenance template generator that turns a
 * cadence (e.g. HVAC filter every 3 months) into upcoming {@link TaskDraft}s
 * with `dueAt` set.
 *
 * Deterministic and time-injected: callers pass `from`/`now`; nothing reaches
 * for `Date.now()`.
 */
import { RRule, rrulestr } from 'rrule';
import type { TaskDraft, TaskCategory } from '@nestai/contracts';
import { toDate, addDays, type Clock } from '../time.js';

export interface ExpandOptions {
  /** Start of the window (inclusive). */
  from: Clock;
  /** End of the window (inclusive). */
  to: Clock;
  /**
   * `DTSTART` for the rule, if the RRULE string omits one. The `rrule` lib
   * requires a start; we inject `from` when none is supplied.
   */
  dtstart?: Clock;
  /** Cap on returned occurrences (safety bound). Default 500. */
  limit?: number;
}

/**
 * Expand an RRULE string into the list of occurrence `Date`s that fall within
 * `[from, to]`. Works whether or not the string includes its own `DTSTART`.
 */
export function expandRecurrence(rule: string, opts: ExpandOptions): Date[] {
  const from = toDate(opts.from);
  const to = toDate(opts.to);
  const limit = opts.limit ?? 500;

  let rrule: RRule;
  const trimmed = rule.trim();
  if (/DTSTART/i.test(trimmed)) {
    const parsed = rrulestr(trimmed);
    rrule = parsed instanceof RRule ? parsed : (parsed as unknown as RRule);
  } else {
    // Parse options then re-instantiate with an injected dtstart.
    const options = RRule.parseString(trimmed);
    options.dtstart = toDate(opts.dtstart ?? from);
    rrule = new RRule(options);
  }

  const all = rrule.between(from, to, true);
  return all.slice(0, limit);
}

/** A home-maintenance template: a recurring chore with a cadence. */
export interface MaintenanceTemplate {
  /** Stable key, e.g. "hvac-filter". */
  key: string;
  title: string;
  description?: string;
  category?: TaskCategory;
  requiredSkills?: string[];
  /** RRULE cadence. Either this or `everyMonths`/`everyDays` is required. */
  rrule?: string;
  /** Convenience cadence: every N months. */
  everyMonths?: number;
  /** Convenience cadence: every N days. */
  everyDays?: number;
  /**
   * Month (1-12) the chore is anchored to when using `everyMonths` >= 12 or
   * for seasonal one-per-year chores (e.g. gutters in late autumn = month 11).
   */
  anchorMonth?: number;
  /** Day-of-month anchor (1-31), default 1. */
  anchorDay?: number;
  urgency?: TaskDraft['urgency'];
}

/** A handful of sensible built-in home-maintenance templates. */
export const DEFAULT_MAINTENANCE_TEMPLATES: MaintenanceTemplate[] = [
  {
    key: 'hvac-filter',
    title: 'Replace HVAC filter',
    description: 'Swap the furnace/AC air filter.',
    category: 'MAINTENANCE',
    everyMonths: 3,
    urgency: 'MED',
  },
  {
    key: 'gutter-cleaning',
    title: 'Clean gutters',
    description: 'Clear gutters of leaves before winter.',
    category: 'MAINTENANCE',
    everyMonths: 12,
    anchorMonth: 11, // late autumn
    anchorDay: 15,
    urgency: 'MED',
  },
  {
    key: 'smoke-detector-battery',
    title: 'Test smoke & CO detectors',
    category: 'MAINTENANCE',
    everyMonths: 6,
    urgency: 'HIGH',
  },
];

function buildRrule(tpl: MaintenanceTemplate, anchor: Date): RRule {
  if (tpl.rrule) {
    const options = RRule.parseString(tpl.rrule);
    options.dtstart = anchor;
    return new RRule(options);
  }
  if (tpl.everyDays != null) {
    return new RRule({ freq: RRule.DAILY, interval: tpl.everyDays, dtstart: anchor });
  }
  const months = tpl.everyMonths ?? 3;
  return new RRule({ freq: RRule.MONTHLY, interval: months, dtstart: anchor });
}

/** Compute the anchor (DTSTART) for a template relative to `from`. */
function computeAnchor(tpl: MaintenanceTemplate, from: Date): Date {
  if (tpl.anchorMonth == null) return from;
  // Anchor to a specific month/day; choose the occurrence at or after `from`.
  const year = from.getUTCFullYear();
  const day = tpl.anchorDay ?? 1;
  let anchor = new Date(Date.UTC(year, tpl.anchorMonth - 1, day));
  if (anchor.getTime() < from.getTime()) {
    anchor = new Date(Date.UTC(year + 1, tpl.anchorMonth - 1, day));
  }
  return anchor;
}

export interface GenerateMaintenanceInput {
  templates?: MaintenanceTemplate[];
  /** Window start (occurrences at/after this). */
  from: Clock;
  /** Window end (occurrences at/before this). Default: 1 year after `from`. */
  to?: Clock;
  /** Cap occurrences per template. Default 12. */
  perTemplateLimit?: number;
}

/**
 * Generate upcoming maintenance {@link TaskDraft}s from templates, each with a
 * concrete `dueAt`. Drafts are returned sorted by `dueAt` ascending.
 */
export function generateMaintenanceTasks(
  input: GenerateMaintenanceInput,
): Array<TaskDraft & { templateKey: string }> {
  const templates = input.templates ?? DEFAULT_MAINTENANCE_TEMPLATES;
  const from = toDate(input.from);
  const to = input.to ? toDate(input.to) : addDays(from, 365);
  const perTemplateLimit = input.perTemplateLimit ?? 12;

  const drafts: Array<TaskDraft & { templateKey: string }> = [];
  for (const tpl of templates) {
    const anchor = computeAnchor(tpl, from);
    const rrule = buildRrule(tpl, anchor);
    const occurrences = rrule.between(from, to, true).slice(0, perTemplateLimit);
    for (const occ of occurrences) {
      drafts.push({
        templateKey: tpl.key,
        title: tpl.title,
        description: tpl.description,
        dueAt: occ.toISOString(),
        urgency: tpl.urgency ?? 'MED',
        category: tpl.category ?? 'MAINTENANCE',
        requiredSkills: tpl.requiredSkills ?? [],
        requiresApproval: false,
      });
    }
  }
  drafts.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  return drafts;
}
