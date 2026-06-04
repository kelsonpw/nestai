/**
 * AnthropicLlmProvider — the live LLM adapter.
 *
 * Uses @anthropic-ai/sdk. `extractTasks` runs on `claude-opus-4-8`; `route`
 * runs on the cheaper `claude-sonnet-4-6`. Both calls use prompt caching:
 * the (frozen) system prompt and the stable family-context block carry
 * `cache_control: { type: "ephemeral" }`, so repeated calls for the same
 * household reuse the cached prefix. Volatile, per-request content (the
 * message text, `now`, the candidate members) goes in the user turn after the
 * cached prefix, never in the system block — see prompt-caching prefix rules.
 *
 * Model output is constrained with `output_config.format` (JSON schema) and
 * then re-validated against the contracts' Zod schemas at the trust boundary.
 * If `ANTHROPIC_API_KEY` is absent the factory falls back to the mock; this
 * class still reads the key from the constructor/env and throws a descriptive
 * error if asked to run unconfigured.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmProvider,
  ExtractionResult,
  RoutingDecision,
  TaskDraft,
  MemberView,
  RoutingRule,
} from '@nestai/contracts';

import {
  ExtractionResultSchema,
  RoutingDecisionSchema,
} from '../zod-runtime.js';

const EXTRACT_MODEL = 'claude-opus-4-8';
const ROUTE_MODEL = 'claude-sonnet-4-6';

const EXTRACT_SYSTEM = `You are NestAI's household extraction engine. Given a single PII-scrubbed inbound message, extract actionable tasks and calendar events for the family.

Rules:
- Parse relative dates (e.g. "Fri 5pm", "tomorrow") into ISO-8601 using the provided "now".
- Detect urgency from keywords: asap/urgent -> CRITICAL, today/by EOD -> HIGH, tomorrow/this week -> MED, else LOW.
- Recognize intents like "we should take the kids to X" as events, not tasks.
- A task that needs a signature, fee, or consent must set requiresApproval=true.
- Only emit items you are confident are actionable. Set per-item and overall confidence in 0..1.
- Respond ONLY with the structured object matching the provided schema.`;

const ROUTE_SYSTEM = `You are NestAI's task router. Given one task draft, the household's candidate members, and routing rules, choose the single best assignee.

Rules:
- Respect minAge/maxAge bounds and required skills (e.g. "driving" requires drivingPrivileges).
- Prefer AVAILABLE members; de-prioritize BUSY/TRAVEL.
- Approvals should route to a HEAD member when possible.
- Honor matching routing rules (higher priority wins).
- If no member is eligible, return assignedMemberId=null.
- Provide a short rationale and ranked alternatives (best-first), excluding the chosen member.
- Respond ONLY with the structured object matching the provided schema.`;

const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          dueAt: { type: 'string' },
          urgency: { type: 'string', enum: ['LOW', 'MED', 'HIGH', 'CRITICAL'] },
          category: {
            type: 'string',
            enum: ['MAINTENANCE', 'SCHOOL', 'ERRAND', 'ADMIN', 'EVENT', 'SEASONAL', 'WELLNESS', 'LOGISTICS'],
          },
          requiredSkills: { type: 'array', items: { type: 'string' } },
          minAge: { type: 'integer' },
          maxAge: { type: 'integer' },
          requiresApproval: { type: 'boolean' },
          suggestedAssignee: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['title', 'urgency', 'category', 'requiredSkills', 'requiresApproval', 'confidence'],
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          startsAt: { type: 'string' },
          endsAt: { type: 'string' },
          location: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              address: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' },
            },
            required: ['label'],
          },
          allDay: { type: 'boolean' },
          ownerHint: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['title', 'startsAt', 'allDay', 'confidence'],
      },
    },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['tasks', 'events', 'confidence'],
} as const;

const ROUTING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    assignedMemberId: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    rationale: { type: 'string' },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          memberId: { type: 'string' },
          score: { type: 'number' },
        },
        required: ['memberId', 'score'],
      },
    },
  },
  required: ['assignedMemberId', 'confidence', 'rationale'],
} as const;

export interface AnthropicLlmConfig {
  apiKey?: string;
  baseUrl?: string;
  extractModel?: string;
  routeModel?: string;
}

export class AnthropicLlmProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly extractModel: string;
  private readonly routeModel: string;

  constructor(config: AnthropicLlmConfig = {}) {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'AnthropicLlmProvider requires an API key. Set ANTHROPIC_API_KEY ' +
          'or pass { apiKey }. (The factory falls back to MockLlmProvider when the key is missing.)',
      );
    }
    this.client = new Anthropic({ apiKey, baseURL: config.baseUrl });
    this.extractModel = config.extractModel ?? EXTRACT_MODEL;
    this.routeModel = config.routeModel ?? ROUTE_MODEL;
  }

  async extractTasks(input: {
    text: string;
    familyContext: string;
    now: string;
  }): Promise<ExtractionResult> {
    // The installed SDK types predate `output_config` / adaptive thinking, so
    // the request body is assembled loosely and cast at the call site. The
    // fields are forwarded to the Messages API verbatim.
    const body = {
      model: this.extractModel,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      // Frozen system prompt + stable family-context block are cached; the
      // per-request message and `now` are NOT cached (they sit in the user turn).
      system: [
        { type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } },
        {
          type: 'text',
          text: `Household context (stable):\n${input.familyContext}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: EXTRACTION_JSON_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `now=${input.now}\n\nMessage:\n${input.text}`,
        },
      ],
    };
    const response = await this.client.messages.create(
      body as unknown as Anthropic.MessageCreateParamsNonStreaming,
    );

    const parsed = extractJson(response);
    return ExtractionResultSchema.parse(parsed) as ExtractionResult;
  }

  async route(input: {
    task: TaskDraft;
    members: MemberView[];
    rules: RoutingRule[];
  }): Promise<RoutingDecision> {
    const body = {
      model: this.routeModel,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: [
        { type: 'text', text: ROUTE_SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      output_config: {
        format: { type: 'json_schema', schema: ROUTING_JSON_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            { task: input.task, members: input.members, rules: input.rules },
            null,
            2,
          ),
        },
      ],
    };
    const response = await this.client.messages.create(
      body as unknown as Anthropic.MessageCreateParamsNonStreaming,
    );

    const parsed = extractJson(response);
    return RoutingDecisionSchema.parse(parsed) as RoutingDecision;
  }
}

/** Pull the model's text output and JSON.parse it (structured-output JSON). */
function extractJson(response: Anthropic.Message): unknown {
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) {
    throw new Error('AnthropicLlmProvider: model returned no text content to parse.');
  }
  return JSON.parse(text);
}
