/**
 * @nestai/contracts — DTOs
 *
 * Request/response shapes for the NestAI API surface. Wherever possible these
 * are derived from the entity schemas via `.pick` / `.omit` / `.partial` so the
 * wire contract stays in lock-step with the domain model.
 *
 * For each DTO we export the Zod schema (`XSchema`) and the inferred type (`X`).
 */
import { z } from 'zod';

import {
  IngestionKindSchema,
  NotificationTypeSchema,
} from './enums.js';
import {
  IdSchema,
  IsoDateTimeSchema,
  TaskSchema,
  ApprovalSchema,
  AvailabilityBlockSchema,
  SeasonalProjectSchema,
  WellnessGoalSchema,
} from './entities.js';

/* -------------------------------------------------------------------------- */
/* Generic envelopes                                                          */
/* -------------------------------------------------------------------------- */

/** A generic paginated list wrapper. */
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(200).default(50),
});
export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * Build a paginated-list response schema around an item schema.
 * Usage: `const TaskListSchema = paginatedList(TaskSchema);`
 */
export const paginatedList = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  });

/** Type of a paginated list given the item type. */
export interface PaginatedList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/* -------------------------------------------------------------------------- */
/* Inbound message ingest                                                     */
/* -------------------------------------------------------------------------- */

/** Push a raw inbound message into the pipeline. */
export const IngestMessageRequestSchema = z.object({
  householdId: IdSchema,
  kind: IngestionKindSchema,
  sourceId: IdSchema.optional(),
  rawText: z.string(),
  mediaUrl: z.string().optional(),
  mediaType: z.string().optional(),
  receivedAt: IsoDateTimeSchema.optional(),
});
export type IngestMessageRequest = z.infer<typeof IngestMessageRequestSchema>;

/** Result of accepting an inbound message. */
export const IngestMessageResponseSchema = z.object({
  messageId: IdSchema,
  accepted: z.boolean(),
  /** Ids of tasks created from this message, if any. */
  createdTaskIds: z.array(IdSchema).default([]),
  /** Ids of events created from this message, if any. */
  createdEventIds: z.array(IdSchema).default([]),
});
export type IngestMessageResponse = z.infer<typeof IngestMessageResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Task lifecycle                                                             */
/* -------------------------------------------------------------------------- */

/** Create a task. Server owns id/householdId-scoping/status/timestamps. */
export const CreateTaskRequestSchema = TaskSchema.omit({
  id: true,
  status: true,
  assignedMemberId: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  urgency: true,
  category: true,
  requiredSkills: true,
  requiresApproval: true,
  confidence: true,
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

/** Assign a task to a member. */
export const AssignTaskRequestSchema = z.object({
  taskId: IdSchema,
  memberId: IdSchema,
});
export type AssignTaskRequest = z.infer<typeof AssignTaskRequestSchema>;

/** Drop (un-assign / decline) a task. */
export const DropTaskRequestSchema = z.object({
  taskId: IdSchema,
  memberId: IdSchema,
  reason: z.string().optional(),
});
export type DropTaskRequest = z.infer<typeof DropTaskRequestSchema>;

/** Claim a broadcast/open task, optionally via a claim token. */
export const ClaimTaskRequestSchema = z.object({
  taskId: IdSchema,
  memberId: IdSchema,
  claimToken: z.string().optional(),
});
export type ClaimTaskRequest = z.infer<typeof ClaimTaskRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Approval decision                                                          */
/* -------------------------------------------------------------------------- */

/** Approve or reject an approval request. */
export const ApprovalDecisionRequestSchema = z.object({
  approvalId: IdSchema,
  decidedById: IdSchema,
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().optional(),
});
export type ApprovalDecisionRequest = z.infer<
  typeof ApprovalDecisionRequestSchema
>;

/** The updated approval after a decision. */
export const ApprovalDecisionResponseSchema = ApprovalSchema;
export type ApprovalDecisionResponse = z.infer<
  typeof ApprovalDecisionResponseSchema
>;

/* -------------------------------------------------------------------------- */
/* Availability upsert                                                        */
/* -------------------------------------------------------------------------- */

/** Upsert one or more availability blocks for a member. */
export const AvailabilityUpsertRequestSchema = z.object({
  memberId: IdSchema,
  blocks: z.array(
    AvailabilityBlockSchema.omit({
      id: true,
      householdId: true,
      memberId: true,
      createdAt: true,
      updatedAt: true,
    }),
  ),
});
export type AvailabilityUpsertRequest = z.infer<
  typeof AvailabilityUpsertRequestSchema
>;

/* -------------------------------------------------------------------------- */
/* Seasonal project create                                                    */
/* -------------------------------------------------------------------------- */

/** Create a seasonal project. */
export const CreateSeasonalProjectRequestSchema = SeasonalProjectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  status: true,
});
export type CreateSeasonalProjectRequest = z.infer<
  typeof CreateSeasonalProjectRequestSchema
>;

/* -------------------------------------------------------------------------- */
/* Wellness goal config                                                       */
/* -------------------------------------------------------------------------- */

/** Configure (create/replace) a member's wellness goal. */
export const WellnessGoalConfigRequestSchema = WellnessGoalSchema.omit({
  id: true,
  householdId: true,
  createdAt: true,
  updatedAt: true,
});
export type WellnessGoalConfigRequest = z.infer<
  typeof WellnessGoalConfigRequestSchema
>;

/* -------------------------------------------------------------------------- */
/* Daily digest payload                                                       */
/* -------------------------------------------------------------------------- */

/** A single line item in a member's daily digest. */
export const DigestItemSchema = z.object({
  taskId: IdSchema.optional(),
  eventId: IdSchema.optional(),
  title: z.string(),
  when: IsoDateTimeSchema.optional(),
  urgency: z.string().optional(),
  note: z.string().optional(),
});
export type DigestItem = z.infer<typeof DigestItemSchema>;

/** The full daily-digest payload delivered to a member. */
export const DigestPayloadSchema = z.object({
  householdId: IdSchema,
  memberId: IdSchema,
  type: NotificationTypeSchema.default('DAILY_DIGEST'),
  /** Local date the digest covers, "YYYY-MM-DD". */
  date: z.string(),
  greeting: z.string().optional(),
  items: z.array(DigestItemSchema).default([]),
  /** Optional balance/load summary surfaced in the digest. */
  summary: z.string().optional(),
});
export type DigestPayload = z.infer<typeof DigestPayloadSchema>;
