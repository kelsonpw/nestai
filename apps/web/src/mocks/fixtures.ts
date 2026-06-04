/**
 * In-repo demo fixtures for "The Rivera Family", consistent with the
 * @nestai/db seed (Alex/Jordan heads + Mia(9)/Sam(15) dependents).
 *
 * Everything is built against the @nestai/contracts types so the UI and the
 * (future) real API stay in lock-step. Dates are computed relative to "now"
 * so the weekly calendar always has content to show.
 */
import type {
  Approval,
  BalanceBattery,
  Conflict,
  DigestPayload,
  Event,
  Household,
  LoadEquity,
  Member,
  Milestone,
  RoutingRule,
  SeasonalProject,
  Task,
  WellnessGoal,
  WellnessWindow,
} from '@nestai/contracts';

import type { DashboardSnapshot } from '../api/client';

const HID = 'hh_rivera';

/* -------------------------------------------------------------------------- */
/* Date helpers — anchor everything to the current week (Mon..Sun).           */
/* -------------------------------------------------------------------------- */

const NOW = new Date();

/** Monday 00:00 of the current week, local time. */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

export const WEEK_START = startOfWeek(NOW);

/** ISO datetime for `dayOffset` days into the current week at `hour`:`min`. */
function at(dayOffset: number, hour: number, min = 0): string {
  const d = new Date(WEEK_START);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

function isoFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

const TS = { createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };

/* -------------------------------------------------------------------------- */
/* Household + members                                                        */
/* -------------------------------------------------------------------------- */

const household: Household = {
  id: HID,
  name: 'The Rivera Family',
  timezone: 'America/Los_Angeles',
  digestTimeLocal: '07:00',
  sundayCheckinTimeLocal: '16:00',
  ...TS,
};

const members: Member[] = [
  {
    id: 'mbr_alex',
    householdId: HID,
    displayName: 'Alex Rivera',
    role: 'HEAD',
    birthDate: '1985-04-12',
    skills: ['Driving', 'Cooking', 'Plumbing'],
    drivingPrivileges: true,
    homeLocation: { label: 'Home', address: '742 Maple Ave, Portland, OR' },
    officeLocation: { label: 'Office', address: 'Downtown Portland, OR' },
    commuteMinutes: 40,
    availabilityState: 'AVAILABLE',
    contactEmail: 'alex@example.com',
    contactPhone: '+15035550100',
    active: true,
    ...TS,
  },
  {
    id: 'mbr_jordan',
    householdId: HID,
    displayName: 'Jordan Rivera',
    role: 'HEAD',
    birthDate: '1986-09-23',
    skills: ['Driving', 'HeavyLifting'],
    drivingPrivileges: true,
    homeLocation: { label: 'Home', address: '742 Maple Ave, Portland, OR' },
    availabilityState: 'AVAILABLE',
    contactEmail: 'jordan@example.com',
    contactPhone: '+15035550101',
    active: true,
    ...TS,
  },
  {
    id: 'mbr_mia',
    householdId: HID,
    displayName: 'Mia Rivera',
    role: 'DEPENDENT',
    birthDate: isoFromAge(9),
    skills: ['PetCare'],
    drivingPrivileges: false,
    availabilityState: 'AVAILABLE',
    active: true,
    ...TS,
  },
  {
    id: 'mbr_sam',
    householdId: HID,
    displayName: 'Sam Rivera',
    role: 'DEPENDENT',
    birthDate: isoFromAge(15),
    skills: ['Driving-Learner', 'Cooking'],
    drivingPrivileges: false,
    availabilityState: 'AVAILABLE',
    active: true,
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Events (unified calendar, color-coded by member)                           */
/* -------------------------------------------------------------------------- */

const events: Event[] = [
  {
    id: 'evt_soccer',
    householdId: HID,
    title: "Mia's soccer practice",
    startsAt: at(1, 16),
    endsAt: at(1, 17, 30),
    location: { label: 'Riverside Park field' },
    ownerMemberId: 'mbr_mia',
    colorTag: 'green',
    allDay: false,
    ...TS,
  },
  {
    id: 'evt_dentist',
    householdId: HID,
    title: 'Family dentist appointments',
    startsAt: at(3, 10),
    endsAt: at(3, 12),
    location: { label: 'Bright Smiles Dental' },
    ownerMemberId: 'mbr_alex',
    colorTag: 'blue',
    allDay: false,
    ...TS,
  },
  {
    id: 'evt_game',
    householdId: HID,
    title: "Sam's away game",
    startsAt: at(5, 9),
    endsAt: at(5, 11, 30),
    location: { label: 'Westside HS' },
    ownerMemberId: 'mbr_sam',
    colorTag: 'amber',
    allDay: false,
    ...TS,
  },
  {
    id: 'evt_standup',
    householdId: HID,
    title: 'Jordan WFH focus block',
    startsAt: at(2, 9),
    endsAt: at(2, 12),
    ownerMemberId: 'mbr_jordan',
    colorTag: 'violet',
    allDay: false,
    ...TS,
  },
  {
    id: 'evt_dinner',
    householdId: HID,
    title: 'Family dinner',
    startsAt: at(4, 18, 30),
    endsAt: at(4, 19, 30),
    ownerMemberId: 'mbr_alex',
    colorTag: 'blue',
    allDay: false,
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Tasks (assigned tasks overlay the calendar; maintenance checklist, etc.)   */
/* -------------------------------------------------------------------------- */

const tasks: Task[] = [
  {
    id: 'task_dishwasher',
    householdId: HID,
    title: 'Unload the dishwasher',
    description: 'Daily chore — any dependent age 8+.',
    category: 'ADMIN',
    urgency: 'LOW',
    status: 'ASSIGNED',
    assignedMemberId: 'mbr_mia',
    requiredSkills: [],
    minAge: 8,
    dueAt: at(0, 19),
    requiresApproval: false,
    confidence: 1,
    ...TS,
  },
  {
    id: 'task_plumbing',
    householdId: HID,
    title: 'Fix leaky kitchen faucet',
    description: 'Slow drip under the sink; needs a washer replacement.',
    category: 'MAINTENANCE',
    urgency: 'MED',
    status: 'ASSIGNED',
    requiredSkills: ['Plumbing'],
    assignedMemberId: 'mbr_alex',
    dueAt: at(2, 14),
    requiresApproval: false,
    confidence: 1,
    ...TS,
  },
  {
    id: 'task_carpool',
    householdId: HID,
    title: 'Drive Sam to Saturday game',
    description: 'Carpool to the away match across town.',
    category: 'LOGISTICS',
    urgency: 'HIGH',
    status: 'OPEN',
    requiredSkills: ['Driving'],
    minAge: 18,
    dueAt: at(5, 8),
    requiresApproval: false,
    confidence: 1,
    ...TS,
  },
  {
    id: 'task_furnace',
    householdId: HID,
    title: 'Replace furnace filter',
    description: 'Monthly maintenance checklist item.',
    category: 'MAINTENANCE',
    urgency: 'LOW',
    status: 'OPEN',
    requiredSkills: [],
    dueAt: at(4, 11),
    requiresApproval: false,
    confidence: 1,
    ...TS,
  },
  {
    id: 'task_smoke',
    householdId: HID,
    title: 'Test smoke detectors',
    description: 'Weekly safety check across all bedrooms.',
    category: 'MAINTENANCE',
    urgency: 'MED',
    status: 'DONE',
    assignedMemberId: 'mbr_jordan',
    requiredSkills: [],
    dueAt: at(1, 8),
    requiresApproval: false,
    confidence: 1,
    ...TS,
  },
  {
    id: 'task_groceries',
    householdId: HID,
    title: 'Weekly grocery run',
    description: 'Stock up for the week.',
    category: 'ERRAND',
    urgency: 'MED',
    status: 'ASSIGNED',
    assignedMemberId: 'mbr_jordan',
    requiredSkills: ['Driving'],
    dueAt: at(6, 10),
    requiresApproval: false,
    confidence: 1,
    ...TS,
  },
  {
    id: 'task_permission',
    householdId: HID,
    title: 'Sign field-trip permission slip',
    description: "Mia's class museum trip.",
    category: 'SCHOOL',
    urgency: 'HIGH',
    status: 'BLOCKED',
    requiredSkills: [],
    dueAt: at(3, 9),
    requiresApproval: true,
    confidence: 1,
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Approvals inbox                                                            */
/* -------------------------------------------------------------------------- */

const approvals: Approval[] = [
  {
    id: 'apr_permission',
    householdId: HID,
    taskId: 'task_permission',
    requestedById: 'mbr_mia',
    status: 'PENDING',
    reason: 'PERMISSION_SLIP',
    ...TS,
  },
  {
    id: 'apr_campfee',
    householdId: HID,
    taskId: 'task_carpool',
    requestedById: 'mbr_sam',
    status: 'PENDING',
    reason: 'FEE',
    amount: 85,
    ...TS,
  },
  {
    id: 'apr_quote',
    householdId: HID,
    taskId: 'task_plumbing',
    requestedById: 'mbr_alex',
    status: 'PENDING',
    reason: 'QUOTE',
    amount: 240,
    ...TS,
  },
  {
    id: 'apr_done',
    householdId: HID,
    taskId: 'task_groceries',
    requestedById: 'mbr_jordan',
    status: 'APPROVED',
    decidedById: 'mbr_alex',
    decidedAt: NOW.toISOString(),
    reason: 'FEE',
    amount: 120,
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Routing rules ("Who Does What")                                            */
/* -------------------------------------------------------------------------- */

const routingRules: RoutingRule[] = [
  {
    id: 'rule_plumbing',
    householdId: HID,
    name: 'Plumbing -> Alex',
    matchSkills: ['Plumbing'],
    matchCategory: 'MAINTENANCE',
    assignToMemberId: 'mbr_alex',
    priority: 100,
    ...TS,
  },
  {
    id: 'rule_driving',
    householdId: HID,
    name: 'Driving tasks -> adults with driving privileges',
    matchSkills: ['Driving'],
    matchCategory: 'LOGISTICS',
    minAge: 18,
    priority: 80,
    ...TS,
  },
  {
    id: 'rule_dishwasher',
    householdId: HID,
    name: 'Dishwasher -> any dependent age >= 8',
    matchSkills: [],
    matchCategory: 'ADMIN',
    minAge: 8,
    priority: 50,
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Conflict radar                                                             */
/* -------------------------------------------------------------------------- */

const conflicts: Conflict[] = [
  {
    id: 'cf_sole_driver',
    householdId: HID,
    type: 'SOLE_DRIVER',
    severity: 'HIGH',
    description:
      "Saturday 9am: Alex is the only available driver for Sam's game while Jordan has a grocery run.",
    mitigation: 'Move grocery run to Sunday, or arrange a carpool with the Ngs.',
    windowStart: at(5, 8),
    windowEnd: at(5, 11),
    relatedTaskId: 'task_carpool',
    ...TS,
  },
  {
    id: 'cf_ripple',
    householdId: HID,
    type: 'RIPPLE_SHIFT',
    severity: 'MEDIUM',
    description:
      'Dentist running long Wednesday would push the plumbing fix past its due window.',
    mitigation: 'Pre-stage faucet parts; allow plumbing task to slide to Thursday.',
    windowStart: at(3, 10),
    windowEnd: at(3, 14),
    relatedTaskId: 'task_plumbing',
    ...TS,
  },
  {
    id: 'cf_buffer',
    householdId: HID,
    type: 'BUFFER_SQUEEZE',
    severity: 'LOW',
    description:
      'Only 30 minutes between Mia’s soccer pickup and family dinner on Friday.',
    mitigation: 'Prep dinner earlier in the day or shift dinner 15 minutes later.',
    windowStart: at(4, 17, 30),
    windowEnd: at(4, 18, 30),
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Seasonal projects + milestones (30d/14d/48h/15m)                           */
/* -------------------------------------------------------------------------- */

function daysFromNow(days: number, hour = 9): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const seasonalProjects: SeasonalProject[] = [
  {
    id: 'sp_summercamp',
    householdId: HID,
    kind: 'CAMP',
    status: 'TRACKING',
    title: 'Summer Camp signup (Mia)',
    targetWindow: { start: daysFromNow(40, 9), end: daysFromNow(75, 17) },
    location: { label: 'Camp Cedarwood' },
    ...TS,
  },
  {
    id: 'sp_skitrip',
    householdId: HID,
    kind: 'SKI_TRIP',
    status: 'SEARCHING',
    title: 'Winter ski trip',
    targetWindow: { start: daysFromNow(120, 9), end: daysFromNow(125, 17) },
    location: { label: 'Mt. Hood' },
    ...TS,
  },
];

const milestones: Milestone[] = [
  {
    id: 'ms_camp_30',
    householdId: HID,
    seasonalProjectId: 'sp_summercamp',
    stage: 'PREP_30D',
    fireAt: daysFromNow(10),
    content: 'Compare camp sessions and confirm dates with Mia.',
    fired: true,
    ...TS,
  },
  {
    id: 'ms_camp_14',
    householdId: HID,
    seasonalProjectId: 'sp_summercamp',
    stage: 'ASSET_CHECK_14D',
    fireAt: daysFromNow(26),
    content: 'Gather immunization records and packing list.',
    fired: false,
    ...TS,
  },
  {
    id: 'ms_camp_48',
    householdId: HID,
    seasonalProjectId: 'sp_summercamp',
    stage: 'FINAL_48H',
    fireAt: daysFromNow(38),
    content: 'Pack bags, label gear, confirm drop-off time.',
    fired: false,
    ...TS,
  },
  {
    id: 'ms_camp_15',
    householdId: HID,
    seasonalProjectId: 'sp_summercamp',
    stage: 'JIT_15M',
    fireAt: daysFromNow(40),
    content: 'Leave now for camp drop-off.',
    fired: false,
    ...TS,
  },
  {
    id: 'ms_ski_30',
    householdId: HID,
    seasonalProjectId: 'sp_skitrip',
    stage: 'PREP_30D',
    fireAt: daysFromNow(90),
    content: 'Book lodging and check ski gear sizes.',
    fired: false,
    ...TS,
  },
  {
    id: 'ms_ski_14',
    householdId: HID,
    seasonalProjectId: 'sp_skitrip',
    stage: 'ASSET_CHECK_14D',
    fireAt: daysFromNow(106),
    content: 'Service skis; confirm chains for the Pilot.',
    fired: false,
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Wellness "soft layer"                                                      */
/* -------------------------------------------------------------------------- */

const wellnessGoals: WellnessGoal[] = [
  {
    id: 'wg_alex_gym',
    householdId: HID,
    memberId: 'mbr_alex',
    kind: 'GYM',
    targetCount: 3,
    durationMin: 45,
    period: 'WEEKLY',
    ...TS,
  },
  {
    id: 'wg_jordan_quiet',
    householdId: HID,
    memberId: 'mbr_jordan',
    kind: 'QUIET',
    targetCount: 1,
    durationMin: 60,
    period: 'WEEKLY',
    ...TS,
  },
  {
    id: 'wg_jordan_datenight',
    householdId: HID,
    memberId: 'mbr_jordan',
    kind: 'DATE_NIGHT',
    targetCount: 1,
    durationMin: 120,
    period: 'BIWEEKLY',
    ...TS,
  },
];

const wellnessWindows: WellnessWindow[] = [
  {
    id: 'ww_alex_1',
    householdId: HID,
    memberId: 'mbr_alex',
    goalId: 'wg_alex_gym',
    startsAt: at(1, 6),
    endsAt: at(1, 6, 45),
    status: 'CLAIMED',
    ...TS,
  },
  {
    id: 'ww_alex_2',
    householdId: HID,
    memberId: 'mbr_alex',
    goalId: 'wg_alex_gym',
    startsAt: at(3, 6),
    endsAt: at(3, 6, 45),
    status: 'SUGGESTED',
    ...TS,
  },
  {
    id: 'ww_alex_3',
    householdId: HID,
    memberId: 'mbr_alex',
    goalId: 'wg_alex_gym',
    startsAt: at(5, 7),
    endsAt: at(5, 7, 45),
    status: 'SUGGESTED',
    ...TS,
  },
  {
    id: 'ww_jordan_quiet',
    householdId: HID,
    memberId: 'mbr_jordan',
    goalId: 'wg_jordan_quiet',
    startsAt: at(2, 20),
    endsAt: at(2, 21),
    status: 'SUGGESTED',
    ...TS,
  },
  {
    id: 'ww_jordan_date',
    householdId: HID,
    memberId: 'mbr_jordan',
    goalId: 'wg_jordan_datenight',
    startsAt: at(5, 19),
    endsAt: at(5, 21),
    status: 'SUGGESTED',
    ...TS,
  },
];

/* -------------------------------------------------------------------------- */
/* Derived: Balance battery + load equity                                     */
/* -------------------------------------------------------------------------- */

const batteries: BalanceBattery[] = [
  { memberId: 'mbr_alex', goalCompletionPct: 33, logisticsLoadPct: 58 },
  { memberId: 'mbr_jordan', goalCompletionPct: 50, logisticsLoadPct: 42 },
];

const loadEquity: LoadEquity[] = [
  { memberId: 'mbr_alex', sharePct: 58, taskLoad: 7 },
  { memberId: 'mbr_jordan', sharePct: 42, taskLoad: 5 },
];

/* -------------------------------------------------------------------------- */
/* Daily digest payloads                                                      */
/* -------------------------------------------------------------------------- */

const today = NOW.toISOString().slice(0, 10);

const digests: DigestPayload[] = [
  {
    householdId: HID,
    memberId: 'mbr_alex',
    type: 'DAILY_DIGEST',
    date: today,
    greeting: 'Good morning, Alex',
    items: [
      {
        eventId: 'evt_dentist',
        title: 'Family dentist appointments',
        when: at(3, 10),
        note: 'You are driving everyone to Bright Smiles Dental.',
      },
      {
        taskId: 'task_plumbing',
        title: 'Fix leaky kitchen faucet',
        when: at(2, 14),
        urgency: 'MED',
        note: 'Quote of $240 awaiting your approval.',
      },
      {
        taskId: 'task_carpool',
        title: 'Drive Sam to Saturday game',
        when: at(5, 8),
        urgency: 'HIGH',
        note: 'You are the sole available driver — see Conflict Radar.',
      },
    ],
    summary:
      'Heavy logistics day. You carry 58% of this week’s load — consider handing off the grocery run.',
  },
  {
    householdId: HID,
    memberId: 'mbr_jordan',
    type: 'DAILY_DIGEST',
    date: today,
    greeting: 'Good morning, Jordan',
    items: [
      {
        eventId: 'evt_standup',
        title: 'WFH focus block',
        when: at(2, 9),
        note: 'Protected time — no pickups scheduled.',
      },
      {
        taskId: 'task_groceries',
        title: 'Weekly grocery run',
        when: at(6, 10),
        urgency: 'MED',
      },
    ],
    summary: 'On track for your quiet-hour goal this week. Date night suggested Friday 7pm.',
  },
];

/* -------------------------------------------------------------------------- */
/* The full snapshot                                                          */
/* -------------------------------------------------------------------------- */

export function buildSnapshot(): DashboardSnapshot {
  return {
    household: structuredClone(household),
    members: structuredClone(members),
    events: structuredClone(events),
    tasks: structuredClone(tasks),
    approvals: structuredClone(approvals),
    routingRules: structuredClone(routingRules),
    conflicts: structuredClone(conflicts),
    seasonalProjects: structuredClone(seasonalProjects),
    milestones: structuredClone(milestones),
    wellnessGoals: structuredClone(wellnessGoals),
    wellnessWindows: structuredClone(wellnessWindows),
    batteries: structuredClone(batteries),
    loadEquity: structuredClone(loadEquity),
    digests: structuredClone(digests),
  };
}
