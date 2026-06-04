/**
 * @nestai/contracts — entities
 *
 * Zod schemas for every domain entity in the NestAI PRD (v2), plus the
 * inferred TS types. These are the single source of truth that the DB,
 * core, adapters and API packages all build against.
 *
 * Conventions:
 *   - `XSchema` is the Zod schema; `X` is the inferred TS type.
 *   - Household-scoped entities carry `id` and `householdId`, and most carry
 *     `createdAt` / `updatedAt` ISO-8601 timestamps.
 *   - Timestamps are represented as ISO strings (isomorphic; no `Date`),
 *     validated as datetime strings where it matters.
 *   - Everything is isomorphic (no Node-only APIs) so the browser frontend
 *     can import it too.
 */
import { z } from 'zod';

import {
  RoleSchema,
  AvailabilityStateSchema,
  TaskUrgencySchema,
  TaskStatusSchema,
  TaskCategorySchema,
  IngestionKindSchema,
  IngestionSourceStatusSchema,
  ApprovalReasonSchema,
  ApprovalStatusSchema,
  NotificationChannelSchema,
  NotificationTypeSchema,
  NotificationStatusSchema,
  SeasonalKindSchema,
  SeasonalStatusSchema,
  MilestoneStageSchema,
  AssetKindSchema,
  AvailabilitySourceSchema,
  ConflictTypeSchema,
  ConflictSeveritySchema,
  WellnessKindSchema,
  WellnessPeriodSchema,
  WellnessWindowStatusSchema,
  PiiTokenTypeSchema,
  ProcessingStatusSchema,
} from './enums.js';

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

/** An opaque identifier (uuid/cuid/etc). Kept as a plain non-empty string. */
export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

/** ISO-8601 datetime string (e.g. "2026-06-04T12:00:00.000Z"). */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Free-form JSON value (for `config`/`payload`/`attrs` records). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

/** A bag of arbitrary JSON keyed by string. Used for config/payload/attrs. */
export const JsonRecordSchema = z.record(JsonValueSchema);
export type JsonRecord = z.infer<typeof JsonRecordSchema>;

/** A simple geo/location reference. Kept loose for the mock-first design. */
export const LocationSchema = z.object({
  label: z.string(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type Location = z.infer<typeof LocationSchema>;

/** A closed time window. */
export const TimeWindowSchema = z.object({
  start: IsoDateTimeSchema,
  end: IsoDateTimeSchema,
});
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

/** Mixin: fields present on every persisted, household-scoped entity. */
const householdScoped = {
  id: IdSchema,
  householdId: IdSchema,
};

/** Mixin: created/updated audit timestamps. */
const timestamped = {
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
};

/* -------------------------------------------------------------------------- */
/* Core household entities                                                     */
/* -------------------------------------------------------------------------- */

/** The top-level tenant. Everything else hangs off a household. */
export const HouseholdSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: z.string().min(1),
  /** Local "HH:mm" time the daily digest fires. */
  digestTimeLocal: z.string(),
  /** Local "HH:mm" time the Sunday check-in fires. */
  sundayCheckinTimeLocal: z.string(),
  ...timestamped,
});
export type Household = z.infer<typeof HouseholdSchema>;

/** A person (or third party) attached to a household. */
export const MemberSchema = z.object({
  ...householdScoped,
  displayName: z.string().min(1),
  role: RoleSchema,
  birthDate: z.string().optional(), // "YYYY-MM-DD"
  skills: z.array(z.string()).default([]),
  drivingPrivileges: z.boolean().default(false),
  homeLocation: LocationSchema.optional(),
  officeLocation: LocationSchema.optional(),
  commuteMinutes: z.number().int().nonnegative().optional(),
  availabilityState: AvailabilityStateSchema.default('AVAILABLE'),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  messagingHandle: z.string().optional(),
  active: z.boolean().default(true),
  ...timestamped,
});
export type Member = z.infer<typeof MemberSchema>;

/* -------------------------------------------------------------------------- */
/* Ingestion                                                                  */
/* -------------------------------------------------------------------------- */

/** A configured inbound integration (calendar, whatsapp, email, ...). */
export const IngestionSourceSchema = z.object({
  ...householdScoped,
  kind: IngestionKindSchema,
  /** Concrete provider id, e.g. "google", "twilio", "imap-mock". */
  provider: z.string().min(1),
  /** Provider-side identifier (calendar id, phone number, mailbox...). */
  externalRef: z.string().optional(),
  config: JsonRecordSchema.default({}),
  lastSyncedAt: IsoDateTimeSchema.optional(),
  status: IngestionSourceStatusSchema.default('ACTIVE'),
  ...timestamped,
});
export type IngestionSource = z.infer<typeof IngestionSourceSchema>;

/** A PII token: where in the text a value was scrubbed and what replaced it. */
export const PiiTokenSchema = z.object({
  /** The placeholder inserted into scrubbedText, e.g. "[ADDRESS_1]". */
  token: z.string().min(1),
  type: PiiTokenTypeSchema,
  /** Original value (kept only where retention policy allows). */
  original: z.string().optional(),
});
export type PiiToken = z.infer<typeof PiiTokenSchema>;

/** A raw inbound message before/after scrubbing and processing. */
export const RawMessageSchema = z.object({
  ...householdScoped,
  sourceId: IdSchema.optional(),
  rawText: z.string(),
  /** PII-scrubbed text safe to hand to an LLM provider. */
  scrubbedText: z.string().optional(),
  /** Mapping of placeholder -> original, produced by the scrubber. */
  tokenMap: z.array(PiiTokenSchema).optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.string().optional(),
  receivedAt: IsoDateTimeSchema,
  processedAt: IsoDateTimeSchema.optional(),
  /** When the raw payload should be purged for privacy. */
  purgeAfter: IsoDateTimeSchema.optional(),
  status: ProcessingStatusSchema.default('PENDING'),
  ...timestamped,
});
export type RawMessage = z.infer<typeof RawMessageSchema>;

/* -------------------------------------------------------------------------- */
/* Calendar / events                                                          */
/* -------------------------------------------------------------------------- */

/** A calendar event (synced or derived). */
export const EventSchema = z.object({
  ...householdScoped,
  title: z.string().min(1),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema.optional(),
  location: LocationSchema.optional(),
  allDay: z.boolean().default(false),
  sourceId: IdSchema.optional(),
  ownerMemberId: IdSchema.optional(),
  colorTag: z.string().optional(),
  /** Provider-side event id for sync de-duplication. */
  externalId: z.string().optional(),
  ...timestamped,
});
export type Event = z.infer<typeof EventSchema>;

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

/** A unit of household work that can be routed, claimed and completed. */
export const TaskSchema = z.object({
  ...householdScoped,
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: IsoDateTimeSchema.optional(),
  urgency: TaskUrgencySchema.default('MED'),
  status: TaskStatusSchema.default('OPEN'),
  category: TaskCategorySchema,
  assignedMemberId: IdSchema.optional(),
  requiredSkills: z.array(z.string()).default([]),
  minAge: z.number().int().nonnegative().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  /** RFC-5545 RRULE string for recurring tasks. */
  recurrenceRule: z.string().optional(),
  parentTaskId: IdSchema.optional(),
  sourceMessageId: IdSchema.optional(),
  requiresApproval: z.boolean().default(false),
  /** Extraction confidence 0..1 when LLM-derived. */
  confidence: z.number().min(0).max(1).default(1),
  ...timestamped,
});
export type Task = z.infer<typeof TaskSchema>;

/* -------------------------------------------------------------------------- */
/* Approvals                                                                  */
/* -------------------------------------------------------------------------- */

/** A human-in-the-loop approval gate attached to a task. */
export const ApprovalSchema = z.object({
  ...householdScoped,
  taskId: IdSchema,
  requestedById: IdSchema,
  status: ApprovalStatusSchema.default('PENDING'),
  decidedById: IdSchema.optional(),
  decidedAt: IsoDateTimeSchema.optional(),
  reason: ApprovalReasonSchema,
  /** Monetary amount where the approval concerns a fee/quote. */
  amount: z.number().nonnegative().optional(),
  ...timestamped,
});
export type Approval = z.infer<typeof ApprovalSchema>;

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/** A scheduled / sent outbound message to a member. */
export const NotificationSchema = z.object({
  ...householdScoped,
  memberId: IdSchema,
  channel: NotificationChannelSchema,
  type: NotificationTypeSchema,
  payload: JsonRecordSchema.default({}),
  scheduledFor: IsoDateTimeSchema,
  sentAt: IsoDateTimeSchema.optional(),
  status: NotificationStatusSchema.default('SCHEDULED'),
  /** Provider message id once dispatched. */
  providerRef: z.string().optional(),
  ...timestamped,
});
export type Notification = z.infer<typeof NotificationSchema>;

/* -------------------------------------------------------------------------- */
/* Routing                                                                    */
/* -------------------------------------------------------------------------- */

/** A declarative rule used to bias task->member routing. */
export const RoutingRuleSchema = z.object({
  ...householdScoped,
  name: z.string().min(1),
  matchCategory: TaskCategorySchema.optional(),
  matchSkills: z.array(z.string()).default([]),
  minAge: z.number().int().nonnegative().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  assignToMemberId: IdSchema.optional(),
  /** Higher priority rules win. */
  priority: z.number().int().default(0),
  ...timestamped,
});
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

/* -------------------------------------------------------------------------- */
/* Family context (retrieval memory)                                          */
/* -------------------------------------------------------------------------- */

/** A retrievable nugget of household context fed to the LLM. */
export const FamilyContextSchema = z.object({
  ...householdScoped,
  /** Free-form bucket, e.g. "preference", "constraint", "fact". */
  kind: z.string().min(1),
  text: z.string().min(1),
  /** Optional reference to a related entity (member, task, ...). */
  refId: IdSchema.optional(),
  /** Optional embedding vector; remains optional within contracts. */
  embedding: z.array(z.number()).optional(),
  ...timestamped,
});
export type FamilyContext = z.infer<typeof FamilyContextSchema>;

/* -------------------------------------------------------------------------- */
/* Seasonal projects & milestones                                            */
/* -------------------------------------------------------------------------- */

/** A multi-step seasonal effort (camp signup, ski trip, ...). */
export const SeasonalProjectSchema = z.object({
  ...householdScoped,
  kind: SeasonalKindSchema,
  status: SeasonalStatusSchema.default('SEARCHING'),
  title: z.string().min(1),
  /** Target date window the project is aiming for. */
  targetWindow: TimeWindowSchema.optional(),
  sourceMessageId: IdSchema.optional(),
  location: LocationSchema.optional(),
  ...timestamped,
});
export type SeasonalProject = z.infer<typeof SeasonalProjectSchema>;

/** Known registration-opening timelines used to pre-empt seasonal work. */
export const RegistrationTimelineSchema = z.object({
  ...householdScoped,
  kind: SeasonalKindSchema,
  region: z.string().optional(),
  label: z.string().min(1),
  /** Free text or ISO date describing when registration opens. */
  opensRule: z.string().min(1),
  /** Days of lead time to start prep before `opensRule`. */
  leadDays: z.number().int().nonnegative(),
  ...timestamped,
});
export type RegistrationTimeline = z.infer<typeof RegistrationTimelineSchema>;

/** A timed nudge within a seasonal project. */
export const MilestoneSchema = z.object({
  ...householdScoped,
  seasonalProjectId: IdSchema,
  stage: MilestoneStageSchema,
  fireAt: IsoDateTimeSchema,
  content: z.string(),
  fired: z.boolean().default(false),
  ...timestamped,
});
export type Milestone = z.infer<typeof MilestoneSchema>;

/** A physical asset whose readiness gates dependent tasks. */
export const HouseholdAssetSchema = z.object({
  ...householdScoped,
  kind: AssetKindSchema,
  name: z.string().min(1),
  attrs: JsonRecordSchema.default({}),
  lastCheckedAt: IsoDateTimeSchema.optional(),
  ...timestamped,
});
export type HouseholdAsset = z.infer<typeof HouseholdAssetSchema>;

/** A dependency edge from a task to an asset or a child task. */
export const TaskDependencySchema = z.object({
  ...householdScoped,
  taskId: IdSchema,
  dependsOnAssetId: IdSchema.optional(),
  dependsOnChildId: IdSchema.optional(),
  reason: z.string().optional(),
  ...timestamped,
});
export type TaskDependency = z.infer<typeof TaskDependencySchema>;

/* -------------------------------------------------------------------------- */
/* Escalation                                                                 */
/* -------------------------------------------------------------------------- */

/** A short-lived token a member redeems to claim a broadcast task. */
export const ClaimTokenSchema = z.object({
  token: z.string().min(1),
  taskId: IdSchema,
  escalationEventId: IdSchema.optional(),
  /** Member the token was minted for (omitted for open broadcasts). */
  memberId: IdSchema.optional(),
  expiresAt: IsoDateTimeSchema,
  /** Set once redeemed. */
  redeemedAt: IsoDateTimeSchema.optional(),
});
export type ClaimToken = z.infer<typeof ClaimTokenSchema>;

/** A tiered escalation/broadcast for an unclaimed or at-risk task. */
export const EscalationEventSchema = z.object({
  ...householdScoped,
  taskId: IdSchema,
  /** Escalation tier (0 = first nudge, grows as it broadens). */
  tier: z.number().int().nonnegative(),
  broadcastAt: IsoDateTimeSchema.optional(),
  claimedById: IdSchema.optional(),
  resolvedAt: IsoDateTimeSchema.optional(),
  /** Hard deadline by which the task must be claimed/resolved. */
  deadline: IsoDateTimeSchema,
  ...timestamped,
});
export type EscalationEvent = z.infer<typeof EscalationEventSchema>;

/* -------------------------------------------------------------------------- */
/* Work / commute availability & conflicts                                   */
/* -------------------------------------------------------------------------- */

/** A block of a member's time (busy/available/travel). */
export const AvailabilityBlockSchema = z.object({
  ...householdScoped,
  memberId: IdSchema,
  kind: AvailabilityStateSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  source: AvailabilitySourceSchema,
  /** When the raw source (e.g. OCR'd screenshot) should be purged. */
  purgeRawAfter: IsoDateTimeSchema.optional(),
  ...timestamped,
});
export type AvailabilityBlock = z.infer<typeof AvailabilityBlockSchema>;

/** A scheduling conflict surfaced by the planner, with a proposed fix. */
export const ConflictSchema = z.object({
  ...householdScoped,
  type: ConflictTypeSchema,
  severity: ConflictSeveritySchema,
  description: z.string(),
  mitigation: z.string(),
  windowStart: IsoDateTimeSchema.optional(),
  windowEnd: IsoDateTimeSchema.optional(),
  relatedTaskId: IdSchema.optional(),
  ...timestamped,
});
export type Conflict = z.infer<typeof ConflictSchema>;

/* -------------------------------------------------------------------------- */
/* Well-being                                                                 */
/* -------------------------------------------------------------------------- */

/** A recurring well-being goal a member sets for themselves. */
export const WellnessGoalSchema = z.object({
  ...householdScoped,
  memberId: IdSchema,
  kind: WellnessKindSchema,
  /** How many times per period the goal should be hit. */
  targetCount: z.number().int().positive(),
  /** Minimum duration (minutes) of each window. */
  durationMin: z.number().int().positive(),
  period: WellnessPeriodSchema,
  ...timestamped,
});
export type WellnessGoal = z.infer<typeof WellnessGoalSchema>;

/** A concrete suggested/claimed slot serving a wellness goal. */
export const WellnessWindowSchema = z.object({
  ...householdScoped,
  memberId: IdSchema,
  goalId: IdSchema.optional(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  status: WellnessWindowStatusSchema.default('SUGGESTED'),
  ...timestamped,
});
export type WellnessWindow = z.infer<typeof WellnessWindowSchema>;

/** Computed "battery" snapshot of a member's balance. (Derived, not stored.) */
export const BalanceBatterySchema = z.object({
  memberId: IdSchema,
  /** 0..100 — share of wellness goals met. */
  goalCompletionPct: z.number().min(0).max(100),
  /** 0..100 — share of total logistics load carried. */
  logisticsLoadPct: z.number().min(0).max(100),
});
export type BalanceBattery = z.infer<typeof BalanceBatterySchema>;

/** Per-member share of the household's logistics load. (Derived.) */
export const LoadEquitySchema = z.object({
  memberId: IdSchema,
  /** 0..100 — this member's percentage of total load. */
  sharePct: z.number().min(0).max(100),
  /** Raw weighted task count attributed to this member. */
  taskLoad: z.number().nonnegative(),
});
export type LoadEquity = z.infer<typeof LoadEquitySchema>;
