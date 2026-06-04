/**
 * Extraction orchestration.
 *
 * Pure orchestration around an injected {@link LlmProvider}: it never
 * constructs an LLM. Given raw (already-scrubbed) text + family context, it
 * calls the provider, then normalizes and validates the returned
 * {@link ExtractionResult} against the contracts shapes, and applies a
 * deterministic post-processor (dedupe + confidence clamping).
 */
import type {
  ExtractionResult,
  LlmProvider,
  TaskDraft,
  EventDraft,
} from '@nestai/contracts';
import {
  TaskUrgencySchema,
  TaskCategorySchema,
  type TaskUrgency,
  type TaskCategory,
} from '@nestai/contracts';
import { clamp, toIso, type Clock } from '../time.js';

export type ExtractedTask = TaskDraft & {
  suggestedAssignee?: string;
  confidence: number;
};
export type ExtractedEvent = EventDraft & {
  ownerHint?: string;
  confidence: number;
};

export interface ExtractInput {
  /** Text to extract from (callers should scrub PII first). */
  text: string;
  /** Serialized family-context string handed to the model. */
  familyContext?: string;
  /** Injected LLM provider (mock or real). */
  llm: LlmProvider;
  /** Time injection for deterministic behaviour. */
  now: Clock;
}

const DEFAULT_URGENCY: TaskUrgency = 'MED';

/** Coerce an unknown urgency into a valid enum value (default MED). */
function normalizeUrgency(value: unknown): TaskUrgency {
  const parsed = TaskUrgencySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_URGENCY;
}

/** Coerce an unknown category into a valid enum value (default ADMIN). */
function normalizeCategory(value: unknown): TaskCategory {
  const parsed = TaskCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : 'ADMIN';
}

/** Clamp a confidence-like input to [0,1]; default to 0 when unusable. */
function normalizeConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(n, 0, 1);
}

function normalizeSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((s): s is string => typeof s === 'string'))];
}

/** Normalize a single extracted task into a well-formed draft. */
function normalizeTask(raw: unknown): ExtractedTask {
  const t = (raw ?? {}) as Record<string, unknown>;
  const draft: ExtractedTask = {
    title: typeof t.title === 'string' ? t.title.trim() : '',
    urgency: normalizeUrgency(t.urgency),
    category: normalizeCategory(t.category),
    requiredSkills: normalizeSkills(t.requiredSkills),
    requiresApproval: t.requiresApproval === true,
    confidence: normalizeConfidence(t.confidence),
  };
  if (typeof t.description === 'string') draft.description = t.description;
  if (typeof t.dueAt === 'string') draft.dueAt = t.dueAt;
  if (typeof t.minAge === 'number' && t.minAge >= 0) draft.minAge = Math.floor(t.minAge);
  if (typeof t.maxAge === 'number' && t.maxAge >= 0) draft.maxAge = Math.floor(t.maxAge);
  if (typeof t.suggestedAssignee === 'string') draft.suggestedAssignee = t.suggestedAssignee;
  return draft;
}

function normalizeEvent(raw: unknown): ExtractedEvent {
  const e = (raw ?? {}) as Record<string, unknown>;
  const draft: ExtractedEvent = {
    title: typeof e.title === 'string' ? e.title.trim() : '',
    startsAt: typeof e.startsAt === 'string' ? e.startsAt : '',
    allDay: e.allDay === true,
    confidence: normalizeConfidence(e.confidence),
  };
  if (typeof e.endsAt === 'string') draft.endsAt = e.endsAt;
  if (typeof e.ownerHint === 'string') draft.ownerHint = e.ownerHint;
  if (e.location && typeof e.location === 'object') {
    draft.location = e.location as ExtractedEvent['location'];
  }
  return draft;
}

/** Stable key for de-duplicating tasks (title + dueAt + category). */
function taskKey(t: ExtractedTask): string {
  return `${t.title.toLowerCase()}|${t.dueAt ?? ''}|${t.category}`;
}

function eventKey(e: ExtractedEvent): string {
  return `${e.title.toLowerCase()}|${e.startsAt}`;
}

export interface PostProcessOptions {
  /** Drop tasks/events below this confidence (default 0 = keep all). */
  minConfidence?: number;
  /** Drop tasks with an empty title (default true). */
  dropEmptyTitles?: boolean;
}

/**
 * Deterministic post-processor: clamp confidences, drop empties/low-confidence,
 * and de-duplicate tasks & events (keeping the highest-confidence instance).
 */
export function postProcess(
  result: ExtractionResult,
  opts: PostProcessOptions = {},
): ExtractionResult {
  const minConfidence = opts.minConfidence ?? 0;
  const dropEmptyTitles = opts.dropEmptyTitles ?? true;

  const dedupeTasks = new Map<string, ExtractedTask>();
  for (const raw of result.tasks ?? []) {
    const t = normalizeTask(raw);
    if (dropEmptyTitles && t.title === '') continue;
    if (t.confidence < minConfidence) continue;
    const key = taskKey(t);
    const existing = dedupeTasks.get(key);
    if (!existing || t.confidence > existing.confidence) {
      dedupeTasks.set(key, t);
    }
  }

  const dedupeEvents = new Map<string, ExtractedEvent>();
  for (const raw of result.events ?? []) {
    const e = normalizeEvent(raw);
    if (dropEmptyTitles && e.title === '') continue;
    if (e.confidence < minConfidence) continue;
    const key = eventKey(e);
    const existing = dedupeEvents.get(key);
    if (!existing || e.confidence > existing.confidence) {
      dedupeEvents.set(key, e);
    }
  }

  const out: ExtractionResult = {
    tasks: [...dedupeTasks.values()],
    events: [...dedupeEvents.values()],
    confidence: normalizeConfidence(result.confidence),
  };
  if (typeof result.notes === 'string') out.notes = result.notes;
  return out;
}

/**
 * Call the injected LLM, then normalize + validate + post-process the result.
 * Pure orchestration; throws nothing on malformed model output — it normalizes.
 */
export async function extract(
  input: ExtractInput,
  opts: PostProcessOptions = {},
): Promise<ExtractionResult> {
  const raw = await input.llm.extractTasks({
    text: input.text,
    familyContext: input.familyContext ?? '',
    now: toIso(input.now),
  });
  return postProcess(raw, opts);
}
