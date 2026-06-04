/**
 * @nestai/adapters
 *
 * Concrete implementations of the integration interfaces declared in
 * @nestai/contracts. Each adapter ships a deterministic, secret-free mock
 * (the default) and a real implementation; `createProviders` selects between
 * them by env (PROVIDER_MODE + per-adapter overrides).
 */
export const NESTAI_ADAPTERS_VERSION = '0.0.0';

// Factory + types
export { createProviders, configFromEnv } from './factory.js';
export type { Providers } from './factory.js';

// LLM
export { MockLlmProvider, AnthropicLlmProvider } from './llm/index.js';
export type { AnthropicLlmConfig } from './llm/index.js';

// Calendar
export {
  MockCalendarProvider,
  RealCalendarProvider,
} from './calendar/index.js';
export type {
  MockCalendarConfig,
  RealCalendarConfig,
} from './calendar/index.js';

// Email
export { MockEmailProvider, RealEmailProvider } from './email/index.js';
export type { MockEmailConfig, RealEmailConfig } from './email/index.js';

// Messaging
export {
  MockMessagingProvider,
  RealMessagingProvider,
} from './messaging/index.js';
export type { RealMessagingConfig } from './messaging/index.js';

// OCR
export { MockOcrProvider, RealOcrProvider } from './ocr/index.js';
export type { MockOcrConfig, RealOcrConfig } from './ocr/index.js';

// Runtime Zod schemas (re-exported for downstream validation reuse)
export {
  TaskDraftItemSchema,
  EventDraftItemSchema,
  ExtractionResultSchema,
  RoutingDecisionSchema,
} from './zod-runtime.js';

// Shared fixture path helpers
export { fixturesDir, fixturePath, sinkPath, writeJsonSink } from './internal/paths.js';
