/**
 * @nestai/contracts — enums
 *
 * String enumerations for the NestAI domain, expressed as Zod enums so they
 * can be used both for runtime validation and as the source of inferred TS
 * union types. For each enum we export:
 *   - `XSchema`  : the Zod enum (use `.parse`, `.options`, etc.)
 *   - `X`        : the inferred TS union type
 *   - `XValues`  : a readonly tuple of the literal values (handy for UIs/seeds)
 *
 * Everything here is isomorphic (no Node-only APIs).
 */
import { z } from 'zod';

/** Member's relationship/authority within the household. */
export const RoleSchema = z.enum(['HEAD', 'DEPENDENT', 'THIRD_PARTY']);
export type Role = z.infer<typeof RoleSchema>;
export const RoleValues = RoleSchema.options;

/** Coarse availability state of a member right now. */
export const AvailabilityStateSchema = z.enum(['AVAILABLE', 'BUSY', 'TRAVEL']);
export type AvailabilityState = z.infer<typeof AvailabilityStateSchema>;
export const AvailabilityStateValues = AvailabilityStateSchema.options;

/** How time-sensitive a task is. */
export const TaskUrgencySchema = z.enum(['LOW', 'MED', 'HIGH', 'CRITICAL']);
export type TaskUrgency = z.infer<typeof TaskUrgencySchema>;
export const TaskUrgencyValues = TaskUrgencySchema.options;

/** Lifecycle state of a task. */
export const TaskStatusSchema = z.enum([
  'OPEN',
  'ASSIGNED',
  'CLAIMED',
  'DROPPED',
  'DONE',
  'BLOCKED',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export const TaskStatusValues = TaskStatusSchema.options;

/** Domain category used for routing and reporting. */
export const TaskCategorySchema = z.enum([
  'MAINTENANCE',
  'SCHOOL',
  'ERRAND',
  'ADMIN',
  'EVENT',
  'SEASONAL',
  'WELLNESS',
  'LOGISTICS',
]);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;
export const TaskCategoryValues = TaskCategorySchema.options;

/** Source channel a raw message / event was ingested from. */
export const IngestionKindSchema = z.enum([
  'CALENDAR',
  'WHATSAPP',
  'EMAIL',
  'UPLOAD',
  'SCREENSHOT',
]);
export type IngestionKind = z.infer<typeof IngestionKindSchema>;
export const IngestionKindValues = IngestionKindSchema.options;

/** Why a task requires human approval before it can proceed. */
export const ApprovalReasonSchema = z.enum([
  'PERMISSION_SLIP',
  'FEE',
  'QUOTE',
  'ASSIGNMENT',
  'OTHER',
]);
export type ApprovalReason = z.infer<typeof ApprovalReasonSchema>;
export const ApprovalReasonValues = ApprovalReasonSchema.options;

/** Decision state of an approval request. */
export const ApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export const ApprovalStatusValues = ApprovalStatusSchema.options;

/** Outbound notification delivery channel. */
export const NotificationChannelSchema = z.enum(['EMAIL', 'SMS', 'WHATSAPP']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export const NotificationChannelValues = NotificationChannelSchema.options;

/** The kind of notification being sent. */
export const NotificationTypeSchema = z.enum([
  'DAILY_DIGEST',
  'JIT_REMINDER',
  'APPROVAL_REQUEST',
  'ESCALATION_BROADCAST',
  'CRITICAL_OVERRIDE',
  'SUNDAY_CHECKIN',
  'MILESTONE',
  'WELLNESS_SUGGESTION',
  'CLAIM_WINDOW',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export const NotificationTypeValues = NotificationTypeSchema.options;

/** Category of a seasonal/recurring household project. */
export const SeasonalKindSchema = z.enum([
  'CAMP',
  'SPORTS',
  'CAMPSITE',
  'SKI_TRIP',
  'TRIP',
]);
export type SeasonalKind = z.infer<typeof SeasonalKindSchema>;
export const SeasonalKindValues = SeasonalKindSchema.options;

/** Tracking state of a seasonal project. */
export const SeasonalStatusSchema = z.enum([
  'SEARCHING',
  'TRACKING',
  'CONFIRMED',
]);
export type SeasonalStatus = z.infer<typeof SeasonalStatusSchema>;
export const SeasonalStatusValues = SeasonalStatusSchema.options;

/** Lead-time stage of a milestone relative to an event. */
export const MilestoneStageSchema = z.enum([
  'PREP_30D',
  'ASSET_CHECK_14D',
  'FINAL_48H',
  'JIT_15M',
]);
export type MilestoneStage = z.infer<typeof MilestoneStageSchema>;
export const MilestoneStageValues = MilestoneStageSchema.options;

/** Kind of household asset tracked for readiness checks. */
export const AssetKindSchema = z.enum(['VEHICLE', 'GEAR']);
export type AssetKind = z.infer<typeof AssetKindSchema>;
export const AssetKindValues = AssetKindSchema.options;

/** Where an availability block was derived from. */
export const AvailabilitySourceSchema = z.enum([
  'NL_TEXT',
  'SUNDAY_CHECKIN',
  'SCREENSHOT_OCR',
]);
export type AvailabilitySource = z.infer<typeof AvailabilitySourceSchema>;
export const AvailabilitySourceValues = AvailabilitySourceSchema.options;

/** Kind of scheduling conflict detected by the planner. */
export const ConflictTypeSchema = z.enum([
  'SOLE_DRIVER',
  'RIPPLE_SHIFT',
  'BUFFER_SQUEEZE',
]);
export type ConflictType = z.infer<typeof ConflictTypeSchema>;
export const ConflictTypeValues = ConflictTypeSchema.options;

/** Severity of a detected conflict. */
export const ConflictSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;
export const ConflictSeverityValues = ConflictSeveritySchema.options;

/** Type of well-being goal a member can set. */
export const WellnessKindSchema = z.enum(['GYM', 'QUIET', 'DATE_NIGHT', 'CUSTOM']);
export type WellnessKind = z.infer<typeof WellnessKindSchema>;
export const WellnessKindValues = WellnessKindSchema.options;

/** Cadence over which a wellness goal is measured. */
export const WellnessPeriodSchema = z.enum(['WEEKLY', 'BIWEEKLY']);
export type WellnessPeriod = z.infer<typeof WellnessPeriodSchema>;
export const WellnessPeriodValues = WellnessPeriodSchema.options;

/** Status of a single suggested wellness window. */
export const WellnessWindowStatusSchema = z.enum([
  'SUGGESTED',
  'CLAIMED',
  'SLID',
  'MISSED',
]);
export type WellnessWindowStatus = z.infer<typeof WellnessWindowStatusSchema>;
export const WellnessWindowStatusValues = WellnessWindowStatusSchema.options;

/** PII token classes used when scrubbing raw inbound content. */
export const PiiTokenTypeSchema = z.enum([
  'ADDRESS',
  'SSN',
  'PHONE',
  'EMAIL',
  'FINANCIAL',
  'CORP_LOGO',
  'NAME',
]);
export type PiiTokenType = z.infer<typeof PiiTokenTypeSchema>;
export const PiiTokenTypeValues = PiiTokenTypeSchema.options;

/** Generic sync/processing status shared by ingestion sources and messages. */
export const ProcessingStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
]);
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;
export const ProcessingStatusValues = ProcessingStatusSchema.options;

/** Delivery status of an outbound notification. */
export const NotificationStatusSchema = z.enum([
  'SCHEDULED',
  'SENT',
  'FAILED',
  'CANCELLED',
]);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;
export const NotificationStatusValues = NotificationStatusSchema.options;

/** Connection/sync status of an ingestion source. */
export const IngestionSourceStatusSchema = z.enum([
  'ACTIVE',
  'PAUSED',
  'ERROR',
  'DISCONNECTED',
]);
export type IngestionSourceStatus = z.infer<typeof IngestionSourceStatusSchema>;
export const IngestionSourceStatusValues = IngestionSourceStatusSchema.options;
