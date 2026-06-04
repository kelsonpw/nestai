/**
 * @nestai/core
 *
 * Core domain logic and orchestration for NestAI. Pure, deterministic and
 * time-injectable (callers pass `now`); depends only on @nestai/contracts so it
 * stays decoupled from concrete adapters.
 */
export const NESTAI_CORE_VERSION = '0.0.0';

export * from './time.js';
export * from './extraction/index.js';
export * from './routing/index.js';
export * from './recurrence/index.js';
export * from './privacy/index.js';
export * from './seasonal/index.js';
export * from './dependencies/index.js';
export * from './escalation/index.js';
export * from './commute/index.js';
export * from './wellbeing/index.js';
