/**
 * @nestai/contracts — providers
 *
 * TYPE-ONLY contracts for the adapter pattern. There is NO runtime/implementation
 * here: concrete mock and live adapters live in @nestai/adapters, while core and
 * api program against these interfaces so every package compiles independently.
 *
 * Mock-first: every shape is expressible without any secrets.
 */
import type {
  TaskUrgency,
  TaskCategory,
  NotificationChannel,
} from './enums.js';
import type {
  Event,
  RoutingRule,
  Location,
  TimeWindow,
} from './entities.js';

/* -------------------------------------------------------------------------- */
/* Configuration / mode                                                       */
/* -------------------------------------------------------------------------- */

/** Whether adapters resolve to mock fakes or real integrations. */
export type ProviderMode = 'mock' | 'real';

/**
 * Environment-derived runtime configuration. Optional fields are absent in
 * mock mode; nothing here is required to run the system mock-first.
 */
export interface NestaiConfig {
  providerMode: ProviderMode;
  /** Default IANA timezone when a household has none. */
  defaultTimezone: string;
  llm?: {
    provider: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  calendar?: {
    provider: string;
    apiKey?: string;
  };
  email?: {
    provider: string;
    apiKey?: string;
    fromAddress?: string;
  };
  messaging?: {
    provider: string;
    apiKey?: string;
    fromNumber?: string;
  };
  ocr?: {
    provider: string;
    apiKey?: string;
  };
}

/* -------------------------------------------------------------------------- */
/* LLM provider                                                               */
/* -------------------------------------------------------------------------- */

/** A lightweight, denormalized view of a member handed to the LLM router. */
export interface MemberView {
  id: string;
  displayName: string;
  role: string;
  age?: number;
  skills: string[];
  drivingPrivileges: boolean;
  availabilityState: string;
}

/** A proposed task the router scores against members/rules. */
export interface TaskDraft {
  title: string;
  description?: string;
  dueAt?: string;
  urgency: TaskUrgency;
  category: TaskCategory;
  requiredSkills: string[];
  minAge?: number;
  maxAge?: number;
  requiresApproval: boolean;
}

/** A proposed event extracted alongside tasks. */
export interface EventDraft {
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: Location;
  allDay: boolean;
}

/** Who/what/when extracted from a single inbound message. */
export interface ExtractionResult {
  tasks: Array<
    TaskDraft & {
      /** Suggested assignee display-name or id, if the model inferred one. */
      suggestedAssignee?: string;
      /** Per-item extraction confidence 0..1. */
      confidence: number;
    }
  >;
  events: Array<
    EventDraft & {
      ownerHint?: string;
      confidence: number;
    }
  >;
  /** Overall confidence the model assigns to this extraction (0..1). */
  confidence: number;
  /** Free-form notes / reasoning the model wants to surface. */
  notes?: string;
}

/** The router's choice of assignee for a task draft. */
export interface RoutingDecision {
  /** Chosen member id, or null when no eligible member was found. */
  assignedMemberId: string | null;
  confidence: number;
  rationale: string;
  /** Ranked alternatives (best-first), excluding the chosen member. */
  alternatives?: Array<{ memberId: string; score: number }>;
}

/** Turns scrubbed text + family context into structured drafts and routes them. */
export interface LlmProvider {
  extractTasks(input: {
    text: string;
    familyContext: string;
    now: string;
  }): Promise<ExtractionResult>;

  route(input: {
    task: TaskDraft;
    members: MemberView[];
    rules: RoutingRule[];
  }): Promise<RoutingDecision>;
}

/* -------------------------------------------------------------------------- */
/* Calendar provider                                                          */
/* -------------------------------------------------------------------------- */

export interface CalendarProvider {
  listEvents(range: TimeWindow): Promise<Event[]>;
  pushEvent(e: Event): Promise<{ externalId: string }>;
}

/* -------------------------------------------------------------------------- */
/* Email provider                                                             */
/* -------------------------------------------------------------------------- */

/** A minimal inbound email shape. */
export interface InboundEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  receivedAt: string;
  attachments?: Array<{ filename: string; url: string; mimeType: string }>;
}

/** A minimal outbound email/message shape. */
export interface OutboundMessage {
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
}

export interface EmailProvider {
  fetchInbox(since: string): Promise<InboundEmail[]>;
  send(msg: OutboundMessage): Promise<{ providerRef: string }>;
}

/* -------------------------------------------------------------------------- */
/* Messaging provider (WhatsApp / SMS)                                        */
/* -------------------------------------------------------------------------- */

/** A normalized inbound message parsed from a provider webhook payload. */
export interface InboundMessage {
  from: string;
  text: string;
  receivedAt: string;
  mediaUrl?: string;
  mediaType?: string;
}

export interface MessagingProvider {
  parseInbound(payload: unknown): Promise<InboundMessage>;
  send(msg: OutboundMessage): Promise<{ providerRef: string }>;
}

/* -------------------------------------------------------------------------- */
/* OCR provider                                                               */
/* -------------------------------------------------------------------------- */

export interface OcrProvider {
  extract(file: {
    url?: string;
    bytes?: Uint8Array;
    mimeType: string;
  }): Promise<{ text: string; blocks?: unknown[] }>;
}
