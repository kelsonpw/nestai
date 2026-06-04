/**
 * Runtime Zod schemas for the provider DTOs declared (type-only) in
 * `@nestai/contracts`'s providers.ts.
 *
 * The contracts package keeps `providers.ts` type-only (no runtime cost for the
 * browser), so the adapters package supplies the matching Zod schemas it needs
 * to *validate* LLM output at the trust boundary. These are intentionally local
 * and derived from the same enum/entity schemas re-exported by contracts.
 */
import {
  TaskUrgencySchema,
  TaskCategorySchema,
  LocationSchema,
} from '@nestai/contracts';
import { z } from 'zod';

/** Matches contracts' `TaskDraft & { suggestedAssignee?, confidence }`. */
export const TaskDraftItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: z.string().optional(),
  urgency: TaskUrgencySchema,
  category: TaskCategorySchema,
  requiredSkills: z.array(z.string()).default([]),
  minAge: z.number().int().nonnegative().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  requiresApproval: z.boolean(),
  suggestedAssignee: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

/** Matches contracts' `EventDraft & { ownerHint?, confidence }`. */
export const EventDraftItemSchema = z.object({
  title: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string().optional(),
  location: LocationSchema.optional(),
  allDay: z.boolean(),
  ownerHint: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

/** Matches contracts' `ExtractionResult`. */
export const ExtractionResultSchema = z.object({
  tasks: z.array(TaskDraftItemSchema),
  events: z.array(EventDraftItemSchema),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

/** Matches contracts' `RoutingDecision`. */
export const RoutingDecisionSchema = z.object({
  assignedMemberId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  alternatives: z
    .array(z.object({ memberId: z.string(), score: z.number() }))
    .optional(),
});
